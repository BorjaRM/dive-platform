import type { NextFunction, Request, RequestHandler, Response } from 'express';

const PUBLIC_BOOKING_PATH =
  /^\/v1\/public\/channels\/([A-Za-z0-9._~-]+)\/bookings$/;
const PUBLIC_BOOKING_ALLOWED_HEADERS =
  'Content-Type, Idempotency-Key, X-Correlation-ID';

export type PublicBookingOriginResolver = (
  channelPublicId: string,
  origin: string,
) => Promise<boolean>;

function allowOrigin(response: Response, origin: string): void {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
}

export function publicBookingCors(
  resolveOrigin: PublicBookingOriginResolver,
): RequestHandler {
  return function publicBookingCorsMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const match = PUBLIC_BOOKING_PATH.exec(request.path);
    const origin = request.get('origin');
    const channelPublicId = match?.[1];
    if (!channelPublicId || !origin) {
      next();
      return;
    }

    void resolveOrigin(channelPublicId, origin)
      .then((allowed) => {
        if (!allowed) {
          delete request.headers.origin;
          next();
          return;
        }

        allowOrigin(response, origin);
        if (request.method !== 'OPTIONS') {
          next();
          return;
        }

        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader(
          'Access-Control-Allow-Headers',
          PUBLIC_BOOKING_ALLOWED_HEADERS,
        );
        response.status(204).end();
      })
      .catch(next);
  };
}
