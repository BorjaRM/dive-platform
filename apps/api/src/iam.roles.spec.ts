import {
  hasTenantWideScope,
  IAM_ROLES,
  permissionsForRoles,
} from '@dive-center/identity';

describe('IAM role permissions (DIVE-IAM-REQ-003, DIVE-IAM-REQ-010..014, DIVE-IAM-REQ-023, DIVE-IAM-REQ-027)', () => {
  it.each([
    IAM_ROLES.tenantOwner,
    IAM_ROLES.tenantAdmin,
    IAM_ROLES.operationsLead,
    IAM_ROLES.auditorCompliance,
    IAM_ROLES.centerManager,
    IAM_ROLES.receptionBookingManager,
  ])('grants center.read to %s', (role) => {
    expect(permissionsForRoles([role])).toContain('center.read');
  });

  it.each([IAM_ROLES.tenantOwner, IAM_ROLES.tenantAdmin])(
    'grants membership.disable to %s',
    (role) => {
      expect(permissionsForRoles([role])).toContain('membership.disable');
    },
  );

  it.each([
    IAM_ROLES.operationsLead,
    IAM_ROLES.auditorCompliance,
    IAM_ROLES.centerManager,
    IAM_ROLES.receptionBookingManager,
    IAM_ROLES.externalCollaborator,
    'unknown_role',
  ])('does not grant membership.disable to %s', (role) => {
    expect(permissionsForRoles([role])).not.toContain('membership.disable');
  });

  it.each([IAM_ROLES.externalCollaborator, 'unknown_role'])(
    'fails closed for disabled or unknown role %s',
    (role) => {
      expect([...permissionsForRoles([role])]).toEqual([]);
      expect(hasTenantWideScope([role])).toBe(false);
    },
  );
});
