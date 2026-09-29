import {
  IAM_AUDIT_ACTIONS,
  IAM_AUDIT_RESULTS,
  IAM_DENIAL_REASONS,
} from '@dive-center/contracts';

describe('IAM audit contracts (DIVE-IAM-REQ-023, DIVE-IAM-REQ-025)', () => {
  it('keeps the approved sensitive action vocabulary stable', () => {
    expect(IAM_AUDIT_ACTIONS).toEqual([
      'membership.invite',
      'membership.disable',
      'center_entry.enable',
      'center_entry.disable',
      'booking.create',
      'booking.read',
      'booking.update',
      'booking.confirm',
      'booking.cancel',
      'customer_contact.read',
      'support.tenant.read',
      'identity.webhook.apply',
    ]);
    expect(IAM_AUDIT_RESULTS).toEqual(['success', 'denied']);
  });

  it('keeps the approved denial reason vocabulary stable', () => {
    expect(IAM_DENIAL_REASONS).toEqual([
      'authentication_missing_or_invalid',
      'membership_missing_or_inactive',
      'permission_missing',
      'scope_mismatch',
      'resource_missing_or_inaccessible',
      'resource_state_invalid',
      'credential_invalid_or_expired',
      'duplicate_or_replayed',
      'assurance_insufficient',
      'support_grant_invalid',
      'last_owner',
      'invariant_violation',
    ]);
  });
});
