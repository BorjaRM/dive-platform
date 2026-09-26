export const DATABASE_POOL = Symbol('DATABASE_POOL');
export const SECURITY_LOGGER = Symbol('SECURITY_LOGGER');

export const IAM_ACTIONS = {
  centerRead: 'center.read',
  membershipDisable: 'membership.disable',
} as const;

export type IamAction = (typeof IAM_ACTIONS)[keyof typeof IAM_ACTIONS];

export interface SecurityLoggerPort {
  warn(
    entry: Readonly<{
      event: string;
      action: IamAction;
      correlationId: string;
    }>,
  ): void;
}
