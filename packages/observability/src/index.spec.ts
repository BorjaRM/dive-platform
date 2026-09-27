import { describe, expect, it } from 'vitest';
import {
  correlationIdForCurrentContext,
  correlationIdFromHeader,
  currentCorrelationId,
  OpenTelemetryObservability,
  runWithCorrelationId,
} from './index.js';

const validCorrelationId = '11111111-1111-4111-8111-111111111111';

describe('correlation context', () => {
  it('keeps a valid incoming ID and replaces malformed values', () => {
    expect(correlationIdFromHeader(validCorrelationId)).toBe(
      validCorrelationId,
    );
    expect(correlationIdFromHeader('client-provided')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('propagates one ID through asynchronous work', async () => {
    await runWithCorrelationId(validCorrelationId, async () => {
      await Promise.resolve();
      expect(currentCorrelationId()).toBe(validCorrelationId);
      expect(correlationIdForCurrentContext()).toBe(validCorrelationId);
    });
    expect(currentCorrelationId()).toBeUndefined();
  });
});

describe('OpenTelemetry observability boundary', () => {
  it('starts and ends an HTTP observation without a configured exporter', () => {
    const observation = new OpenTelemetryObservability().startHttpRequest(
      validCorrelationId,
      { 'http.request.method': 'GET', 'url.path': '/health' },
    );

    expect(() => observation.end(200)).not.toThrow();
    expect(() => observation.end(500)).not.toThrow();
  });
});
