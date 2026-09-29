import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiProblemException } from '../common/http/problem-details.js';
import { rejectUnknownFields } from '../common/validation/request-validation.js';
import type { TenantBootstrapInput } from './tenant-bootstrap.dto.js';

function displayName(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ApiProblemException(422, 'validation_error');
  }
  const normalized = value.trim().normalize('NFC');
  const length = [...normalized].length;
  if (length < 1 || length > 120) {
    throw new ApiProblemException(
      422,
      'validation_error',
      `${field} must contain between 1 and 120 Unicode code points`,
    );
  }
  return normalized;
}

function timeZone(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiProblemException(422, 'validation_error');
  }
  const normalized = value.trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: normalized }).format();
  } catch {
    throw new ApiProblemException(422, 'validation_error');
  }
  return normalized;
}

@Injectable()
export class TenantBootstrapInputPipe implements PipeTransform {
  transform(value: unknown): TenantBootstrapInput {
    rejectUnknownFields(value, [
      'operatorDisplayName',
      'centerDisplayName',
      'timeZone',
      'locale',
    ]);
    const input = value as Record<string, unknown>;
    if (input.locale !== 'es' && input.locale !== 'en') {
      throw new ApiProblemException(422, 'validation_error');
    }
    return {
      operatorDisplayName: displayName(
        input.operatorDisplayName,
        'operatorDisplayName',
      ),
      centerDisplayName: displayName(
        input.centerDisplayName,
        'centerDisplayName',
      ),
      timeZone: timeZone(input.timeZone),
      locale: input.locale,
    };
  }
}
