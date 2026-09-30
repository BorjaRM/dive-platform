import {
  positiveInteger,
  rejectUnknownFields,
  uuid,
} from '../common/validation/request-validation.js';
import type {
  CatalogActivityInput,
  CatalogListQueryInput,
  CatalogSettingsInput,
  CatalogSlotInput,
} from './catalog.dto.js';
import { CatalogProblemException } from './catalog.errors.js';
import { parseCatalogInstant } from './catalog.time.js';

export { positiveInteger, rejectUnknownFields, uuid };

const PAGE_DEFAULT = 1;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

export function pagination(query: CatalogListQueryInput) {
  const page = query.page === undefined ? PAGE_DEFAULT : Number(query.page);
  const pageSize =
    query.pageSize === undefined ? PAGE_SIZE_DEFAULT : Number(query.pageSize);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PAGE_SIZE_MAX
  ) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'Invalid pagination bounds',
    );
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'Pagination offset is outside the safe integer range',
    );
  }
  return { page, pageSize, offset };
}

export function localized(
  value: unknown,
  field: string,
  required: true,
): Record<string, string>;
export function localized(
  value: unknown,
  field: string,
  required: false,
): Record<string, string> | undefined;
export function localized(
  value: unknown,
  field: string,
  required: boolean,
): Record<string, string> | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} must be an object`,
    );
  }
  const input = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const language of ['es', 'en']) {
    if (input[language] !== undefined) {
      if (
        typeof input[language] !== 'string' ||
        input[language].trim() === ''
      ) {
        throw new CatalogProblemException(
          422,
          'validation_error',
          `${field}.${language} must be non-empty`,
        );
      }
      result[language] = input[language];
    }
  }
  if (Object.keys(result).length === 0 && required) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} must contain es or en`,
    );
  }
  if (Object.keys(input).some((key) => !['es', 'en'].includes(key))) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} contains an unsupported locale`,
    );
  }
  return result;
}

export function statusFilter(value: unknown, allowed: readonly string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'Invalid status',
    );
  }
  return value;
}

export function parseCatalogActivityInput(
  value: unknown,
): CatalogActivityInput {
  rejectUnknownFields(value, ['name', 'description', 'defaultCapacity']);
  const input = value as Record<string, unknown>;
  return {
    name: localized(input.name, 'name', true),
    description: localized(input.description, 'description', false),
    defaultCapacity:
      input.defaultCapacity === undefined
        ? undefined
        : positiveInteger(input.defaultCapacity, 'defaultCapacity'),
  };
}

export function parseCatalogSettingsInput(
  value: unknown,
): CatalogSettingsInput {
  rejectUnknownFields(value, ['defaultActivityLocale']);
  const input = value as Record<string, unknown>;
  if (
    input.defaultActivityLocale !== 'es' &&
    input.defaultActivityLocale !== 'en'
  ) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'defaultActivityLocale must be es or en',
    );
  }
  return { defaultActivityLocale: input.defaultActivityLocale };
}

export function parseCatalogInputInstant(value: unknown, field: string) {
  try {
    return parseCatalogInstant(value, field);
  } catch (error) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      (error as Error).message,
    );
  }
}

export function parseCatalogSlotInput(value: unknown): CatalogSlotInput {
  rejectUnknownFields(value, ['startsAt', 'durationMinutes', 'capacity']);
  const input = value as Record<string, unknown>;
  parseCatalogInputInstant(input.startsAt, 'startsAt');
  return {
    startsAt: input.startsAt,
    durationMinutes: positiveInteger(input.durationMinutes, 'durationMinutes'),
    capacity: positiveInteger(input.capacity, 'capacity'),
  };
}

export function parseCatalogListQueryInput(
  value: unknown,
): CatalogListQueryInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'query must be an object',
    );
  }
  const input = value as Record<string, unknown>;
  return {
    page: input.page === undefined ? undefined : Number(input.page),
    pageSize: input.pageSize === undefined ? undefined : Number(input.pageSize),
    status: input.status,
    from: input.from,
    to: input.to,
  };
}
