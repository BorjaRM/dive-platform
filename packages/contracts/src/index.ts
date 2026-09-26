export const IAM_AUDIT_ACTIONS = [
  'membership.invite',
  'membership.disable',
  'booking.create',
  'booking.read',
  'booking.update',
  'booking.confirm',
  'booking.cancel',
  'customer_contact.read',
  'support.tenant.read',
  'identity.webhook.apply',
] as const;

export type IamAuditAction = (typeof IAM_AUDIT_ACTIONS)[number];

export const IAM_AUDIT_RESULTS = ['success', 'denied'] as const;

export type IamAuditResult = (typeof IAM_AUDIT_RESULTS)[number];

export const IAM_DENIAL_REASONS = [
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
] as const;

export type IamDenialReason = (typeof IAM_DENIAL_REASONS)[number];
