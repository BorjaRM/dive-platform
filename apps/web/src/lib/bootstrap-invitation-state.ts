const invitationStatuses = [
  'issued',
  'consumed',
  'revoked',
  'expired',
  'superseded',
] as const;
const deliveryStatuses = [
  'pending',
  'retrying',
  'succeeded',
  'dead_letter',
] as const;

export const invitationUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BootstrapInvitationState = Readonly<{
  invitationId: string;
  destinationEmail: string;
  status: (typeof invitationStatuses)[number];
  deliveryStatus: (typeof deliveryStatuses)[number];
  issuedAt?: string;
  expiresAt?: string;
}>;

export function parseBootstrapInvitationState(
  value: unknown,
): BootstrapInvitationState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const status = invitationStatuses.find(
    (candidate) => candidate === input.status,
  );
  const deliveryStatus = deliveryStatuses.find(
    (candidate) => candidate === input.deliveryStatus,
  );
  if (
    typeof input.invitationId !== 'string' ||
    !invitationUuid.test(input.invitationId) ||
    typeof input.destinationEmail !== 'string' ||
    input.destinationEmail.trim() === '' ||
    !status ||
    !deliveryStatus
  )
    return null;
  for (const field of ['issuedAt', 'expiresAt'] as const) {
    if (
      input[field] !== undefined &&
      (typeof input[field] !== 'string' ||
        !Number.isFinite(Date.parse(input[field])))
    )
      return null;
  }
  return {
    invitationId: input.invitationId,
    destinationEmail: input.destinationEmail,
    status,
    deliveryStatus,
    ...(typeof input.issuedAt === 'string'
      ? { issuedAt: new Date(input.issuedAt).toISOString() }
      : {}),
    ...(typeof input.expiresAt === 'string'
      ? { expiresAt: new Date(input.expiresAt).toISOString() }
      : {}),
  };
}
