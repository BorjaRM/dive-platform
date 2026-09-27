import {
  CORRELATION_ID_HEADER,
  currentCorrelationId,
} from '@dive-center/observability';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CorrelationIdMiddleware } from './correlation-id.middleware.js';

describe('CorrelationIdMiddleware', () => {
  it('propagates and returns a valid correlation ID', () => {
    const setHeader = vi.fn();
    const listeners = new Map<string, () => void>();
    const response = {
      setHeader,
      statusCode: 200,
      once: vi.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
        return response;
      }),
    };
    const next = vi.fn(() => {
      expect(currentCorrelationId()).toBe(
        '11111111-1111-4111-8111-111111111111',
      );
    });

    new CorrelationIdMiddleware().use(
      {
        headers: {
          [CORRELATION_ID_HEADER]: '11111111-1111-4111-8111-111111111111',
        },
        method: 'GET',
        path: '/health',
      } as unknown as Request,
      response as unknown as Response,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(next).toHaveBeenCalledOnce();
    listeners.get('finish')?.();
  });

  it('generates a correlation ID when the request header is invalid', () => {
    const setHeader = vi.fn();
    const response = {
      setHeader,
      statusCode: 200,
      once: vi.fn(),
    };

    new CorrelationIdMiddleware().use(
      {
        headers: { [CORRELATION_ID_HEADER]: 'invalid' },
        method: 'GET',
        path: '/health',
      } as unknown as Request,
      response as unknown as Response,
      vi.fn(),
    );

    expect(setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
  });
});
