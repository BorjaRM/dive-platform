import { describe, expect, it } from 'vitest';
import {
  PublicBookingCapabilityCrypto,
  publicBookingCapabilitySecretFromEnvironment,
} from './public-booking.crypto.js';

const secret = 'J7m!Q2v#L9r@X4p$N6w^C8z&K5t*H3d?';

describe('public booking capability crypto', () => {
  it('derives stable purpose-specific bearer values and verifier hashes', () => {
    const crypto = new PublicBookingCapabilityCrypto(secret);
    const confirmation = crypto.token(
      '2d2c9a9e-63f6-45e2-8b5b-a3f17c7b6f30',
      'booking_confirmation_read',
      1,
    );
    const cancellation = crypto.token(
      '2d2c9a9e-63f6-45e2-8b5b-a3f17c7b6f30',
      'booking_cancel',
      1,
    );

    expect(confirmation).toBe(
      crypto.token(
        '2d2c9a9e-63f6-45e2-8b5b-a3f17c7b6f30',
        'booking_confirmation_read',
        1,
      ),
    );
    expect(cancellation).not.toBe(confirmation);
    expect(crypto.verifierHash(confirmation)).toHaveLength(64);
    expect(crypto.verifierHash(confirmation)).not.toBe(confirmation);
  });

  it('requires a dedicated capability secret', () => {
    expect(() =>
      publicBookingCapabilitySecretFromEnvironment({
        NODE_ENV: 'production',
      }),
    ).toThrow('PUBLIC_BOOKING_CAPABILITY_HMAC_SECRET');
  });
});
