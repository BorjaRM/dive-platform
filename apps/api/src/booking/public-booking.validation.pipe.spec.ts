import { describe, expect, it } from 'vitest';
import { CatalogProblemException } from '../catalog/catalog.errors.js';
import { parsePublicBookingInput } from './public-booking.validation.pipe.js';

describe('public booking input validation', () => {
  it('normalizes a valid booker without accepting authorization fields', () => {
    expect(
      parsePublicBookingInput({
        slotId: '2d2c9a9e-63f6-45e2-8b5b-a3f17c7b6f30',
        seats: 2,
        locale: 'es',
        booker: {
          firstName: '  Ana ',
          lastName: ' Ruiz ',
          email: ' ANA@example.com ',
        },
      }),
    ).toEqual({
      slotId: '2d2c9a9e-63f6-45e2-8b5b-a3f17c7b6f30',
      seats: 2,
      locale: 'es',
      booker: {
        firstName: 'Ana',
        lastName: 'Ruiz',
        email: 'ana@example.com',
      },
    });

    expect(() =>
      parsePublicBookingInput({
        slotId: '2d2c9a9e-63f6-45e2-8b5b-a3f17c7b6f30',
        seats: 1,
        locale: 'en',
        confirmationMode: 'immediate',
        booker: {
          firstName: 'Ana',
          lastName: 'Ruiz',
          email: 'ana@example.com',
        },
      }),
    ).toThrow(CatalogProblemException);
  });

  it('rejects malformed contact and seat values', () => {
    expect(() =>
      parsePublicBookingInput({
        slotId: 'not-a-uuid',
        seats: 0,
        locale: 'en',
        booker: {
          firstName: 'Ana',
          lastName: 'Ruiz',
          email: 'not-an-email',
        },
      }),
    ).toThrow(CatalogProblemException);
  });
});
