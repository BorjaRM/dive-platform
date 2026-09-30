import { describe, expect, it } from 'vitest';
import { CatalogProblemException } from './catalog.errors.js';
import {
  pagination,
  parseCatalogActivityInput,
  parseCatalogInputInstant,
  parseCatalogListQueryInput,
  parseCatalogSettingsInput,
  parseCatalogSlotInput,
  positiveInteger,
  uuid,
} from './catalog.validation.js';

describe('catalog runtime validation', () => {
  it.each(['startsAt', 'from', 'to'])(
    'parses %s and adapts invalid instants to a catalog validation error',
    (field) => {
      expect(
        parseCatalogInputInstant('2030-01-01T11:00:00+01:00', field).toString(),
      ).toBe('2030-01-01T10:00:00Z');
      expect(() => parseCatalogInputInstant('not-an-instant', field)).toThrow(
        CatalogProblemException,
      );
    },
  );

  it.each(['es', 'en'] as const)(
    'accepts explicit center catalog language %s (DIVE-BOOK-REQ-009, 050)',
    (defaultActivityLocale) => {
      expect(parseCatalogSettingsInput({ defaultActivityLocale })).toEqual({
        defaultActivityLocale,
      });
    },
  );

  it.each([
    null,
    [],
    {},
    { defaultActivityLocale: null },
    { defaultActivityLocale: 'fr' },
    { defaultActivityLocale: 'ES' },
    { defaultActivityLocale: ' es ' },
    { defaultActivityLocale: 'es', tenantId: 'untrusted' },
    { defaultActivityLocale: 'en', centerId: 'untrusted' },
  ])(
    'rejects invalid catalog settings without a default (DIVE-BOOK-REQ-056)',
    (input) => {
      expect(() => parseCatalogSettingsInput(input)).toThrow(
        CatalogProblemException,
      );
    },
  );

  it('rejects per-activity language selection (DIVE-BOOK-REQ-051)', () => {
    expect(() =>
      parseCatalogActivityInput({ baseLocale: 'es', name: { es: 'Buceo' } }),
    ).toThrow(CatalogProblemException);
  });

  it('normalizes valid activity input and rejects unsupported fields', () => {
    expect(
      parseCatalogActivityInput({
        name: { es: 'Buceo', en: 'Diving' },
        defaultCapacity: 8,
      }),
    ).toEqual({
      name: { es: 'Buceo', en: 'Diving' },
      description: undefined,
      defaultCapacity: 8,
    });

    expect(() =>
      parseCatalogActivityInput({
        name: { es: 'Buceo' },
        unexpected: true,
      }),
    ).toThrow(CatalogProblemException);
  });

  it('rejects malformed slot values before persistence', () => {
    expect(() =>
      parseCatalogSlotInput({
        startsAt: 'not-an-instant',
        durationMinutes: 60,
        capacity: 8,
      }),
    ).toThrow(CatalogProblemException);

    expect(() =>
      parseCatalogSlotInput({
        startsAt: '2030-01-01T10:00:00Z',
        durationMinutes: '60',
        capacity: 8,
      }),
    ).toThrow(CatalogProblemException);
  });

  it('normalizes query pagination values for service validation', () => {
    expect(
      parseCatalogListQueryInput({
        page: '2',
        pageSize: '10',
        status: 'Draft',
      }),
    ).toEqual({ page: 2, pageSize: 10, status: 'Draft' });
  });

  it('rejects an offset outside the safe integer range', () => {
    expect(() =>
      pagination(
        parseCatalogListQueryInput({
          page: Number.MAX_SAFE_INTEGER,
          pageSize: 50,
        }),
      ),
    ).toThrow(CatalogProblemException);
  });

  it('canonicalizes UUID resource selectors', () => {
    expect(uuid('AAAAAAAA-1001-4001-8001-000000000001', 'activityId')).toBe(
      'aaaaaaaa-1001-4001-8001-000000000001',
    );
  });

  it('accepts only positive integers representable by PostgreSQL int4', () => {
    expect(positiveInteger(1, 'capacity')).toBe(1);
    expect(positiveInteger(2_147_483_647, 'capacity')).toBe(2_147_483_647);
    expect(() => positiveInteger(2_147_483_648, 'capacity')).toThrow(
      CatalogProblemException,
    );
  });
});
