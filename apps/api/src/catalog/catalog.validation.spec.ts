import { describe, expect, it } from 'vitest';
import { CatalogProblemException } from './catalog.errors.js';
import {
  activityEtag,
  pagination,
  parseActivityPrecondition,
  parseCatalogActivityEditInput,
  parseCatalogActivityInput,
  parseCatalogInputInstant,
  parseCatalogListQueryInput,
  parseCatalogSettingsInput,
  parseCatalogSlotInput,
  parseCatalogUpcomingQueryInput,
  positiveInteger,
  uuid,
} from './catalog.validation.js';

describe('catalog runtime validation', () => {
  it('accepts complete independent activity forms (DIVE-BOOK-REQ-050, 078)', () => {
    const translation = {
      group: 'translation',
      locale: 'en',
      values: { name: '', description: '  ' },
    };
    expect(parseCatalogActivityEditInput(translation)).toEqual(translation);
    expect(
      parseCatalogActivityEditInput({
        group: 'common',
        values: { defaultCapacity: null },
      }),
    ).toEqual({ group: 'common', values: { defaultCapacity: null } });
  });

  it.each([
    null,
    {},
    {
      group: 'translation',
      locale: 'fr',
      values: { name: 'Dive', description: '' },
    },
    { group: 'translation', locale: 'en', values: { name: 'Dive' } },
    {
      group: 'translation',
      locale: 'en',
      values: { name: null, description: '' },
    },
    {
      group: 'translation',
      locale: 'en',
      values: { name: 'Dive', description: '', defaultCapacity: 5 },
    },
    { group: 'common', locale: 'es', values: { defaultCapacity: 5 } },
    { group: 'common', values: {} },
    { group: 'common', values: { defaultCapacity: 0 } },
    { group: 'common', values: { defaultCapacity: 2_147_483_648 } },
    { group: 'common', values: { defaultCapacity: 5 }, tenantId: 'untrusted' },
  ])(
    'rejects incomplete or mixed activity forms (DIVE-BOOK-REQ-056)',
    (input) => {
      expect(() => parseCatalogActivityEditInput(input)).toThrow(
        CatalogProblemException,
      );
    },
  );

  it.each([
    'introductory',
    'guided_dive',
    'course',
    'snorkel',
    'freediving',
    null,
  ])(
    'accepts commercial category %s without a description (DIVE-BOOK-REQ-074)',
    (category) => {
      const input = {
        group: 'commercial',
        values: { category, otherDescription: {} },
      };
      expect(parseCatalogActivityEditInput(input)).toEqual(input);
    },
  );

  it('accepts other with a description and blank values for any category (DIVE-BOOK-REQ-074)', () => {
    const other = {
      group: 'commercial',
      values: {
        category: 'other',
        otherDescription: { es: 'Limpieza de fondos', en: '' },
      },
    };
    expect(parseCatalogActivityEditInput(other)).toEqual(other);
    const blank = {
      group: 'commercial',
      values: { category: null, otherDescription: { es: '  ', en: '' } },
    };
    expect(parseCatalogActivityEditInput(blank)).toEqual(blank);
  });

  it('counts the description bound in Unicode code points (DIVE-BOOK-REQ-074)', () => {
    const astral = '🐠'.repeat(500);
    expect(
      parseCatalogActivityEditInput({
        group: 'commercial',
        values: { category: 'other', otherDescription: { es: astral } },
      }),
    ).toEqual({
      group: 'commercial',
      values: { category: 'other', otherDescription: { es: astral } },
    });
    expect(() =>
      parseCatalogActivityEditInput({
        group: 'commercial',
        values: {
          category: 'other',
          otherDescription: { es: 'a'.repeat(501) },
        },
      }),
    ).toThrow(expect.objectContaining({ status: 422 }));
  });

  it.each([
    ['unknown code', { category: 'wreck', otherDescription: {} }],
    ['label instead of code', { category: 'Snorkel', otherDescription: {} }],
    ['uppercase code', { category: 'OTHER', otherDescription: { es: 'x' } }],
    ['missing category', { otherDescription: {} }],
    ['missing otherDescription', { category: null }],
    ['null otherDescription', { category: null, otherDescription: null }],
    ['array otherDescription', { category: null, otherDescription: [] }],
    [
      'unsupported description locale',
      { category: 'other', otherDescription: { es: 'x', fr: 'y' } },
    ],
    [
      'non-string description',
      { category: 'other', otherDescription: { es: 5 } },
    ],
    [
      'description with non-other category',
      { category: 'snorkel', otherDescription: { es: 'Limpieza' } },
    ],
    [
      'description with null category',
      { category: null, otherDescription: { en: 'Cleanup' } },
    ],
    [
      'extra values field',
      { category: null, otherDescription: {}, defaultCapacity: 5 },
    ],
  ])(
    'rejects commercial form with %s (DIVE-BOOK-REQ-056, 074)',
    (_case, values) => {
      expect(() =>
        parseCatalogActivityEditInput({ group: 'commercial', values }),
      ).toThrow(expect.objectContaining({ status: 422 }));
    },
  );

  it.each([
    {
      group: 'commercial',
      locale: 'es',
      values: { category: null, otherDescription: {} },
    },
    {
      group: 'commercial',
      values: { category: null, otherDescription: {} },
      tenantId: 'untrusted',
    },
    { group: 'commercial' },
    { group: 'commercial', values: null },
  ])(
    'rejects commercial envelope with locale, extra or missing fields (DIVE-BOOK-REQ-056, 074)',
    (input) => {
      expect(() => parseCatalogActivityEditInput(input)).toThrow(
        expect.objectContaining({ status: 422 }),
      );
    },
  );

  it('preserves BIGINT revision precision in ETags (DIVE-BOOK-REQ-078)', () => {
    const activityId = 'aaaaaaaa-1001-4001-8001-000000000001';
    const revision = 9_223_372_036_854_775_807n;
    expect(
      parseActivityPrecondition(activityEtag(activityId, revision)),
    ).toEqual({ activityId, revision });
    expect(() => parseActivityPrecondition(undefined)).toThrow(
      expect.objectContaining({ status: 428 }),
    );
  });

  it.each([
    '*',
    '',
    'W/"activity-aaaaaaaa-1001-4001-8001-000000000001-r1"',
    '"activity-aaaaaaaa-1001-4001-8001-000000000001-r0"',
    '"activity-aaaaaaaa-1001-4001-8001-000000000001-r9223372036854775808"',
    '"activity-aaaaaaaa-1001-4001-8001-000000000001-r1", "other"',
  ])('rejects unsupported preconditions (DIVE-BOOK-REQ-056)', (input) => {
    expect(() => parseActivityPrecondition(input)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

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

  it.each([
    'introductory',
    'guided_dive',
    'course',
    'snorkel',
    'freediving',
    'other',
  ] as const)(
    'accepts commercial fields on activity creation: %s',
    (category) => {
      const input = {
        name: { es: 'Buceo' },
        category,
        otherDescription:
          category === 'other' ? { es: 'Limpieza de fondos' } : {},
      };
      expect(parseCatalogActivityInput(input)).toEqual(input);
    },
  );

  it('accepts an explicit empty commercial description on activity creation', () => {
    expect(
      parseCatalogActivityInput({
        name: { es: 'Buceo' },
        category: null,
        otherDescription: { es: '  ', en: '' },
      }),
    ).toEqual({
      name: { es: 'Buceo' },
      description: undefined,
      defaultCapacity: undefined,
      category: null,
      otherDescription: { es: '  ', en: '' },
    });
  });

  it.each([
    ['unknown category', { category: 'wreck', otherDescription: {} }],
    [
      'description with another category',
      { category: 'snorkel', otherDescription: { es: 'Limpieza' } },
    ],
    ['missing otherDescription', { category: 'other' }],
  ])(
    'rejects invalid commercial fields on activity creation: %s',
    (_, fields) => {
      expect(() =>
        parseCatalogActivityInput({ name: { es: 'Buceo' }, ...fields }),
      ).toThrow(CatalogProblemException);
    },
  );

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

  it('accepts only the required upcoming-session instant', () => {
    expect(
      parseCatalogUpcomingQueryInput({ from: '2030-10-01T10:00:00Z' }),
    ).toEqual({ from: '2030-10-01T10:00:00Z' });
    expect(() =>
      parseCatalogUpcomingQueryInput({ from: '2030-10-01T10:00:00Z', page: 2 }),
    ).toThrow(CatalogProblemException);
    expect(() => parseCatalogUpcomingQueryInput({})).toThrow(
      CatalogProblemException,
    );
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
