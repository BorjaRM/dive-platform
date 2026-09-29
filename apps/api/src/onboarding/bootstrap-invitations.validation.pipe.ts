import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiProblemException } from '../common/http/problem-details.js';
import {
  rejectUnknownFields,
  uuid,
} from '../common/validation/request-validation.js';
import type {
  BootstrapInvitationIssueInput,
  BootstrapInvitationMutationInput,
} from './bootstrap-invitations.dto.js';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiProblemException(
      422,
      'validation_error',
      `${field} must be a non-empty string`,
    );
  }
  return value.trim();
}

@Injectable()
export class BootstrapInvitationIssueInputPipe implements PipeTransform {
  transform(value: unknown): BootstrapInvitationIssueInput {
    rejectUnknownFields(value, ['destinationEmail', 'reason']);
    const input = value as Record<string, unknown>;
    return {
      destinationEmail: requiredString(
        input.destinationEmail,
        'destinationEmail',
      ),
      reason: requiredString(input.reason, 'reason'),
    };
  }
}

@Injectable()
export class BootstrapInvitationMutationInputPipe implements PipeTransform {
  transform(value: unknown): BootstrapInvitationMutationInput {
    rejectUnknownFields(value, ['reason']);
    const input = value as Record<string, unknown>;
    return { reason: requiredString(input.reason, 'reason') };
  }
}

@Injectable()
export class BootstrapInvitationUuidPipe implements PipeTransform {
  transform(value: string): string {
    return uuid(value, 'invitationId');
  }
}
