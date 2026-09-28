import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { publicBookingCors } from './public-booking.cors.js';

type FakeResponse = Response & {
  headers: Map<string, string>;
  ended: boolean;
  statusCode: number;
};

function response(): FakeResponse {
  const headers = new Map<string, string>();
  const value = {
    headers,
    ended: false,
    statusCode: 200,
    setHeader(name: string, headerValue: string) {
      headers.set(name, headerValue);
    },
    status(code: number) {
      value.statusCode = code;
      return value;
    },
    end() {
      value.ended = true;
      return value;
    },
  } as unknown as FakeResponse;
  return value;
}

function request(path: string, method: string, origin: string): Request {
  return {
    path,
    method,
    headers: { origin },
    get: (header: string) =>
      header.toLowerCase() === 'origin' ? origin : undefined,
  } as unknown as Request;
}

function flushMiddleware(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('public booking CORS', () => {
  it('allows the configured channel origin and completes preflight', async () => {
    const resolveOrigin = vi.fn().mockResolvedValue(true);
    const middleware = publicBookingCors(resolveOrigin);
    const result = response();
    const next = vi.fn() as unknown as NextFunction;

    middleware(
      request(
        '/v1/public/channels/hosted-es/bookings',
        'OPTIONS',
        'https://hosted.example.test',
      ),
      result,
      next,
    );
    await flushMiddleware();

    expect(resolveOrigin).toHaveBeenCalledWith(
      'hosted-es',
      'https://hosted.example.test',
    );
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://hosted.example.test',
    );
    expect(result.headers.get('Access-Control-Allow-Methods')).toBe(
      'POST, OPTIONS',
    );
    expect(result.statusCode).toBe(204);
    expect(result.ended).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not grant CORS to an origin rejected by the channel', async () => {
    const middleware = publicBookingCors(vi.fn().mockResolvedValue(false));
    const result = response();
    const next = vi.fn() as unknown as NextFunction;
    const rejectedRequest = request(
      '/v1/public/channels/hosted-es/bookings',
      'OPTIONS',
      'https://attacker.example.test',
    );

    middleware(rejectedRequest, result, next);
    await flushMiddleware();

    expect(result.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(next).toHaveBeenCalledOnce();
    expect(rejectedRequest.headers.origin).toBeUndefined();
    expect(result.ended).toBe(false);
  });
});
