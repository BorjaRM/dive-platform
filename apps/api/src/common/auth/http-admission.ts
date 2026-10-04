import type { IamAccessContext } from '@dive-center/database';
import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';

export type ResolvedCenterApplicationScope = Readonly<{
  access: IamAccessContext;
  centerId: string;
}>;

export const HTTP_ADMISSION_METADATA = 'api:http-admission';

const classificationApproval = {
  source:
    'specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#proposed-exception-inventory-with-normative-authority',
  date: '2026-10-01',
} as const;

export const nonCenterAdmissionExceptions = {
  operators: {
    method: 'GET',
    path: '/v1/me/operators',
    mechanism: 'clerk',
    owner: 'specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md',
    requirements: ['DIVE-IAM-REQ-031'],
    approval: classificationApproval,
    test: 'apps/api/test/iam.e2e-spec.ts',
  },
  tenantContextIssue: {
    method: 'POST',
    path: '/v1/me/tenant-contexts',
    mechanism: 'clerk',
    owner: 'specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md',
    requirements: ['DIVE-IAM-REQ-030', 'DIVE-IAM-REQ-031'],
    approval: classificationApproval,
    test: 'apps/api/test/iam.e2e-spec.ts',
  },
  tenantContextRevoke: {
    method: 'DELETE',
    path: '/v1/me/tenant-contexts',
    mechanism: 'clerk',
    owner: 'specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md',
    requirements: ['DIVE-IAM-REQ-030'],
    approval: classificationApproval,
    test: 'apps/api/test/iam.e2e-spec.ts',
  },
  membershipDisable: {
    method: 'PATCH',
    path: '/v1/memberships/:membershipId/disable',
    mechanism: 'clerk',
    owner: 'specs/iam/SPEC-DIVE-IAM-001.md',
    requirements: ['DIVE-IAM-REQ-003', 'DIVE-IAM-REQ-018', 'DIVE-IAM-REQ-025'],
    approval: classificationApproval,
    test: 'apps/api/test/iam.e2e-spec.ts',
  },
  tenantBootstrap: {
    method: 'POST',
    path: '/v1/me/tenant-bootstrap',
    mechanism: 'clerk',
    owner: 'specs/onboarding/SPEC-DIVE-ONBOARDING-001.md',
    requirements: ['DIVE-ONB-REQ-001', 'DIVE-ONB-REQ-041'],
    approval: classificationApproval,
    test: 'apps/api/test/onboarding.e2e-spec.ts',
  },
  bootstrapInvitationIssue: {
    method: 'POST',
    path: '/v1/platform/bootstrap-invitations',
    mechanism: 'clerk',
    owner: 'specs/onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md',
    requirements: ['DIVE-ONB-REQ-005', 'DIVE-ONB-REQ-039', 'DIVE-ONB-REQ-040'],
    approval: classificationApproval,
    test: 'apps/api/test/onboarding.e2e-spec.ts',
  },
  bootstrapInvitationRead: {
    method: 'GET',
    path: '/v1/platform/bootstrap-invitations/:invitationId',
    mechanism: 'clerk',
    owner: 'specs/onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md',
    requirements: ['DIVE-ONB-REQ-039', 'DIVE-ONB-REQ-040'],
    approval: classificationApproval,
    test: 'apps/api/test/onboarding.e2e-spec.ts',
  },
  bootstrapInvitationReissue: {
    method: 'POST',
    path: '/v1/platform/bootstrap-invitations/:invitationId/reissue',
    mechanism: 'clerk',
    owner: 'specs/onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md',
    requirements: ['DIVE-ONB-REQ-039', 'DIVE-ONB-REQ-040', 'DIVE-ONB-REQ-045'],
    approval: classificationApproval,
    test: 'apps/api/test/onboarding.e2e-spec.ts',
  },
  bootstrapInvitationRevoke: {
    method: 'POST',
    path: '/v1/platform/bootstrap-invitations/:invitationId/revoke',
    mechanism: 'clerk',
    owner: 'specs/onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md',
    requirements: ['DIVE-ONB-REQ-005', 'DIVE-ONB-REQ-039', 'DIVE-ONB-REQ-040'],
    approval: classificationApproval,
    test: 'apps/api/test/onboarding.e2e-spec.ts',
  },
  publicBooking: {
    method: 'POST',
    path: '/v1/public/channels/:channelPublicId/bookings',
    mechanism: 'public-channel',
    owner: 'specs/booking/SPEC-DIVE-BOOKING-PUBLIC-001.md',
    requirements: [
      'DIVE-BOOK-REQ-004',
      'DIVE-BOOK-REQ-058',
      'DIVE-BOOK-REQ-064',
    ],
    approval: classificationApproval,
    test: 'apps/api/test/iam.e2e-spec.ts',
  },
  clerkWebhook: {
    method: 'POST',
    path: '/v1/webhooks/clerk',
    mechanism: 'provider-signature',
    owner: 'specs/iam/SPEC-DIVE-IAM-001.md',
    requirements: ['DIVE-IAM-REQ-021'],
    approval: classificationApproval,
    test: 'apps/api/test/iam.e2e-spec.ts',
  },
} as const;

export type HttpAdmissionClassification =
  | Readonly<{ kind: 'center-data' | 'center-bootstrap' }>
  | Readonly<{
      kind: 'exception';
      exception: keyof typeof nonCenterAdmissionExceptions;
    }>;

export const HttpAdmission = (classification: HttpAdmissionClassification) =>
  SetMetadata(HTTP_ADMISSION_METADATA, Object.freeze(classification));

export const CenterApplicationScope = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): ResolvedCenterApplicationScope => {
    const request = context
      .switchToHttp()
      .getRequest<{ applicationScope?: ResolvedCenterApplicationScope }>();
    if (!request.applicationScope)
      throw new ForbiddenException('Access denied');
    return request.applicationScope;
  },
);
