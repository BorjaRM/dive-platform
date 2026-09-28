import { ApiProblemException } from '../http/problem-details.js';

export function uuid(value: string, field: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ApiProblemException(
      422,
      'validation_error',
      `${field} must be a UUID`,
    );
  }
  return value;
}

export function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new ApiProblemException(
      422,
      'validation_error',
      `${field} must be a positive integer`,
    );
  }
  return value;
}

export function rejectUnknownFields(
  value: unknown,
  allowed: readonly string[],
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiProblemException(
      422,
      'validation_error',
      'body must be an object',
    );
  }
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new ApiProblemException(
      422,
      'validation_error',
      `body contains an unsupported field: ${unknown}`,
    );
  }
}
