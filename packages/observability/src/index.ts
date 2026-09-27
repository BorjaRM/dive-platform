import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
  type Attributes,
  type Span,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

const correlationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const correlationStorage = new AsyncLocalStorage<string>();

export function correlationIdFromHeader(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && correlationIdPattern.test(candidate)
    ? candidate
    : randomUUID();
}

export function currentCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

export function correlationIdForCurrentContext(): string {
  return currentCorrelationId() ?? randomUUID();
}

export function runWithCorrelationId<T>(
  correlationId: string,
  callback: () => T,
): T {
  return correlationStorage.run(correlationId, callback);
}

export interface HttpObservation {
  end(statusCode: number, error?: unknown): void;
}

export interface ObservabilityPort {
  startHttpRequest(
    correlationId: string,
    attributes: Readonly<Attributes>,
  ): HttpObservation;
}

export class OpenTelemetryObservability implements ObservabilityPort {
  private readonly tracer = trace.getTracer('dive-center');

  startHttpRequest(
    correlationId: string,
    attributes: Readonly<Attributes>,
  ): HttpObservation {
    const span = this.tracer.startSpan('http.server', {
      attributes: {
        ...attributes,
        'dive.correlation_id': correlationId,
      },
    });
    return new OpenTelemetryHttpObservation(span);
  }
}

class OpenTelemetryHttpObservation implements HttpObservation {
  private ended = false;

  constructor(private readonly span: Span) {}

  end(statusCode: number, error?: unknown): void {
    if (this.ended) return;
    this.ended = true;
    this.span.setAttribute('http.response.status_code', statusCode);
    if (error) {
      this.span.recordException(error as Error);
      this.span.setStatus({ code: SpanStatusCode.ERROR });
    } else if (statusCode >= 500) {
      this.span.setStatus({ code: SpanStatusCode.ERROR });
    } else {
      this.span.setStatus({ code: SpanStatusCode.OK });
    }
    this.span.end();
  }
}
