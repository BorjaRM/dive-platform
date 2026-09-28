import { Injectable, type PipeTransform } from '@nestjs/common';
import { CatalogProblemException } from '../catalog.errors.js';
import { rejectUnknownFields } from '../catalog.validation.js';
import type { ChannelPolicyInput } from './channel-policy.dto.js';

export function parseChannelPolicyInput(value: unknown): ChannelPolicyInput {
  rejectUnknownFields(value, ['confirmationMode']);
  const confirmationMode = (value as Record<string, unknown>).confirmationMode;
  if (
    confirmationMode !== 'immediate' &&
    confirmationMode !== 'staff_approval'
  ) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'confirmationMode must be immediate or staff_approval',
    );
  }
  return { confirmationMode };
}

@Injectable()
export class ChannelPolicyInputPipe
  implements PipeTransform<unknown, ChannelPolicyInput>
{
  transform(value: unknown): ChannelPolicyInput {
    return parseChannelPolicyInput(value);
  }
}
