import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiProblemException } from '../common/http/problem-details.js';
import {
  positiveInteger,
  rejectUnknownFields,
  uuid,
} from '../common/validation/request-validation.js';
import type { PublicBookingInput } from './public-booking.dto.js';

function text(value: unknown, field: string, maximumLength: number): string {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > maximumLength
  ) {
    throw new ApiProblemException(
      422,
      'validation_error',
      `${field} must be a non-empty string`,
    );
  }
  return value.trim();
}

function parseBooker(value: unknown): PublicBookingInput['booker'] {
  rejectUnknownFields(value, ['firstName', 'lastName', 'email', 'phone']);
  const input = value as Record<string, unknown>;
  const email = text(input.email, 'booker.email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiProblemException(
      422,
      'validation_error',
      'booker.email must be a valid email address',
    );
  }
  return {
    firstName: text(input.firstName, 'booker.firstName', 200),
    lastName: text(input.lastName, 'booker.lastName', 200),
    email,
    ...(input.phone === undefined
      ? {}
      : { phone: text(input.phone, 'booker.phone', 50) }),
  };
}

export function parsePublicBookingInput(value: unknown): PublicBookingInput {
  rejectUnknownFields(value, ['slotId', 'seats', 'locale', 'booker']);
  const input = value as Record<string, unknown>;
  const locale = input.locale;
  if (locale !== 'es' && locale !== 'en') {
    throw new ApiProblemException(
      422,
      'validation_error',
      'locale must be es or en',
    );
  }
  if (input.booker === undefined) {
    throw new ApiProblemException(
      422,
      'validation_error',
      'booker is required',
    );
  }
  return {
    slotId: uuid(text(input.slotId, 'slotId', 64), 'slotId'),
    seats: positiveInteger(input.seats, 'seats'),
    locale,
    booker: parseBooker(input.booker),
  };
}

@Injectable()
export class PublicBookingInputPipe
  implements PipeTransform<unknown, PublicBookingInput>
{
  transform(value: unknown): PublicBookingInput {
    return parsePublicBookingInput(value);
  }
}
