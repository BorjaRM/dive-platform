export const DATABASE_POOL = Symbol('DATABASE_POOL');
export const SECURITY_LOGGER = Symbol('SECURITY_LOGGER');

export interface SecurityLoggerPort {
  warn(entry: Readonly<{ event: string; correlationId: string }>): void;
}
