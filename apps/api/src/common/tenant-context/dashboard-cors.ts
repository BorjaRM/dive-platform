import { ServiceUnavailableException } from '@nestjs/common';

type CenterOriginResolver = (origin: string) => Promise<boolean>;
type ResolverErrorReporter = (error: Error) => void;

export function dashboardCors(
  exactOrigins: readonly string[],
  isCenterOriginAllowed: CenterOriginResolver,
  reportResolverError: ResolverErrorReporter,
) {
  return {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, false);
        return;
      }
      if (exactOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      void isCenterOriginAllowed(origin)
        .then((allowed) => callback(null, allowed))
        .catch((error: Error) => {
          reportResolverError(error);
          callback(
            new ServiceUnavailableException(
              'Center origin resolution unavailable',
            ),
            false,
          );
        });
    },
    credentials: false,
    allowedHeaders: [
      'Authorization',
      'X-Tenant-Context',
      'X-Correlation-ID',
      'Content-Type',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Correlation-ID'],
  };
}
