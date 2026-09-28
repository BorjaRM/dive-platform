import { createHmac } from 'node:crypto';
import {
  assertProductionSecretStrength,
  type Environment,
  runtimeEnvironmentFromEnvironment,
} from '../common/config/environment.js';

export const PUBLIC_BOOKING_CAPABILITY_CRYPTO = Symbol(
  'PUBLIC_BOOKING_CAPABILITY_CRYPTO',
);

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function publicBookingCapabilitySecretFromEnvironment(
  environment: Environment,
): string {
  const runtimeEnvironment = runtimeEnvironmentFromEnvironment(environment);
  const value = required(environment, 'PUBLIC_BOOKING_CAPABILITY_HMAC_SECRET');
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('Invalid PUBLIC_BOOKING_CAPABILITY_HMAC_SECRET');
  }
  assertProductionSecretStrength(
    value,
    'PUBLIC_BOOKING_CAPABILITY_HMAC_SECRET',
    runtimeEnvironment,
  );
  return value;
}

export class PublicBookingCapabilityCrypto {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('Invalid public booking capability secret');
    }
  }

  token(bookingId: string, purpose: string, version: number): string {
    return `cap_${createHmac('sha256', this.secret)
      .update(`${bookingId}:${purpose}:${version}`, 'utf8')
      .digest('base64url')}`;
  }

  verifierHash(token: string): string {
    return createHmac('sha256', this.secret)
      .update(token, 'utf8')
      .digest('hex');
  }
}
