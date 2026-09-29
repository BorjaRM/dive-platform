import { describe, expect, it } from 'vitest';
import { ApiProblemException } from '../common/http/problem-details.js';
import {
  BootstrapInvitationIssueInputPipe,
  BootstrapInvitationMutationInputPipe,
  BootstrapInvitationUuidPipe,
} from './bootstrap-invitations.validation.pipe.js';

describe('bootstrap invitation request validation', () => {
  it('accepts only destination and reason for issue', () => {
    const pipe = new BootstrapInvitationIssueInputPipe();
    expect(
      pipe.transform({
        destinationEmail: ' OWNER@example.test ',
        reason: ' Pilot ',
      }),
    ).toEqual({
      destinationEmail: 'OWNER@example.test',
      reason: 'Pilot',
    });
    try {
      pipe.transform({
        destinationEmail: 'owner@example.test',
        reason: 'Pilot',
        redirectUrl: 'https://attacker.example.test',
      });
      throw new Error('Expected unsupported field rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiProblemException);
      expect(error).toMatchObject({
        response: expect.objectContaining({
          detail: expect.stringContaining('unsupported field'),
        }),
      });
    }
  });

  it('accepts only a reason for mutations', () => {
    const pipe = new BootstrapInvitationMutationInputPipe();
    expect(pipe.transform({ reason: ' Replace ' })).toEqual({
      reason: 'Replace',
    });
    expect(() => pipe.transform({ reason: '', role: 'owner' })).toThrow();
  });

  it('requires canonical UUID route identifiers', () => {
    const pipe = new BootstrapInvitationUuidPipe();
    expect(pipe.transform('AAAAAAAA-1111-4111-8111-111111111111')).toBe(
      'aaaaaaaa-1111-4111-8111-111111111111',
    );
    try {
      pipe.transform('not-an-id');
      throw new Error('Expected UUID rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiProblemException);
      expect(error).toMatchObject({
        response: expect.objectContaining({
          detail: expect.stringContaining('must be a UUID'),
        }),
      });
    }
  });
});
