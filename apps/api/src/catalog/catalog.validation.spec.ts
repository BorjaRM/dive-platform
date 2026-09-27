import { describe, expect, it } from 'vitest';
import { CatalogProblemException } from './catalog.errors.js';
import {
  pagination,
  parseCatalogActivityInput,
  parseCatalogListQueryInput,
  parseCatalogSlotInput,
} from './catalog.validation.js';

describe('catalog runtime validation', () => {
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
});
