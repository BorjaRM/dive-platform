import type { IamDenialReason } from '@dive-center/contracts';

export const SECURITY_LOGGER = Symbol('SECURITY_LOGGER');

export const IAM_ACTIONS = {
  centerRead: 'center.read',
  centerEntryManage: 'center_entry.manage',
  tenantContextIssue: 'tenant.context.issue',
  tenantContextRevoke: 'tenant.context.revoke',
  identityWebhookApply: 'identity.webhook.apply',
  membershipInvite: 'membership.invite',
  membershipDisable: 'membership.disable',
} as const;

export type IamAction = (typeof IAM_ACTIONS)[keyof typeof IAM_ACTIONS];

export interface SecurityLoggerPort {
  warn(
    entry: Readonly<{
      event: string;
      action: IamAction;
      reason: IamDenialReason;
      correlationId: string;
    }>,
  ): void;
  operational?(entry: Readonly<{ event: string; correlationId: string }>): void;
}
