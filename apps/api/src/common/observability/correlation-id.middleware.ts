import {
  CORRELATION_ID_HEADER,
  correlationIdFromHeader,
  OpenTelemetryObservability,
  runWithCorrelationId,
} from '@dive-center/observability';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly observability = new OpenTelemetryObservability();

  use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = correlationIdFromHeader(
      request.headers[CORRELATION_ID_HEADER],
    );
    const observation = this.observability.startHttpRequest(correlationId, {
      'http.request.method': request.method,
      'url.path': request.path,
    });

    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    response.once('finish', () => observation.end(response.statusCode));
    response.once('close', () => observation.end(response.statusCode));

    try {
      runWithCorrelationId(correlationId, next);
    } catch (error) {
      observation.end(500, error);
      throw error;
    }
  }
}
