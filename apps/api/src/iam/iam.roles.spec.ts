import {
  authorizeIamMembership,
  hasTenantWideScope,
  IAM_PERMISSIONS,
  IAM_ROLES,
  permissionsForRoles,
} from '@dive-center/identity';

describe('IAM role permissions (DIVE-IAM-REQ-003, DIVE-IAM-REQ-010..014, DIVE-IAM-REQ-023, DIVE-IAM-REQ-027)', () => {
  const expectedPermissions = new Map([
    [
      IAM_ROLES.tenantOwner,
      [
        'center.read',
        'booking_service.create',
        'booking_service.read',
        'booking_service.update',
        'booking_service.publish',
        'availability.read',
        'availability.manage',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.confirm',
        'booking.cancel',
        'calendar.read',
        'audit.read',
        'membership.invite',
        'membership.disable',
        'membership.read',
        'channel.read',
        'channel.manage',
      ],
    ],
    [
      IAM_ROLES.tenantAdmin,
      [
        'center.read',
        'booking_service.create',
        'booking_service.read',
        'booking_service.update',
        'booking_service.publish',
        'availability.read',
        'availability.manage',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.confirm',
        'booking.cancel',
        'calendar.read',
        'audit.read',
        'membership.invite',
        'membership.disable',
        'membership.read',
        'channel.read',
        'channel.manage',
      ],
    ],
    [
      IAM_ROLES.operationsLead,
      [
        'center.read',
        'booking_service.create',
        'booking_service.read',
        'booking_service.update',
        'booking_service.publish',
        'availability.read',
        'availability.manage',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.confirm',
        'booking.cancel',
        'calendar.read',
        'audit.read',
      ],
    ],
    [
      IAM_ROLES.auditorCompliance,
      [
        'center.read',
        'booking_service.read',
        'availability.read',
        'booking.read',
        'calendar.read',
        'audit.read',
        'membership.read',
        'channel.read',
      ],
    ],
    [
      IAM_ROLES.centerManager,
      [
        'center.read',
        'booking_service.create',
        'booking_service.read',
        'booking_service.update',
        'booking_service.publish',
        'availability.read',
        'availability.manage',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.confirm',
        'booking.cancel',
        'calendar.read',
        'audit.read',
        'channel.read',
        'channel.manage',
      ],
    ],
    [
      IAM_ROLES.receptionBookingManager,
      [
        'center.read',
        'booking_service.read',
        'availability.read',
        'availability.manage',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.confirm',
        'booking.cancel',
        'calendar.read',
      ],
    ],
    [IAM_ROLES.externalCollaborator, []],
  ] as const);

  it.each(
    [...expectedPermissions].flatMap(([role, expected]) =>
      IAM_PERMISSIONS.map((permission) => ({
        role,
        permission,
        expected: expected.includes(permission as never),
      })),
    ),
  )(
    '$role grants $permission = $expected',
    ({ role, permission, expected }) => {
      expect(permissionsForRoles([role]).has(permission)).toBe(expected);
    },
  );

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

  it.each(['pending', 'disabled', 'unknown'])(
    'denies membership state %s',
    (membershipStatus) => {
      expect(
        authorizeIamMembership({
          membershipStatus,
          roles: [IAM_ROLES.tenantOwner],
          centerIds: null,
          permission: 'center.read',
          tenantMatches: true,
          resourceExists: true,
          resourceStateAllows: true,
        }),
      ).toEqual({
        allowed: false,
        reason: 'membership_missing_or_inactive',
      });
    },
  );

  it.each([
    IAM_ROLES.tenantOwner,
    IAM_ROLES.tenantAdmin,
    IAM_ROLES.operationsLead,
    IAM_ROLES.auditorCompliance,
  ])(
    'authorizes tenant-wide scope for %s without center assignments',
    (role) => {
      expect(
        authorizeIamMembership({
          membershipStatus: 'active',
          roles: [role],
          centerIds: [],
          permission: 'center.read',
          requestedCenterId: 'any-center-in-the-tenant',
          tenantMatches: true,
          resourceExists: true,
          resourceStateAllows: true,
        }),
      ).toEqual({ allowed: true });
    },
  );

  it('denies an unknown permission', () => {
    expect(
      authorizeIamMembership({
        membershipStatus: 'active',
        roles: [IAM_ROLES.tenantOwner],
        centerIds: null,
        permission: 'unknown.permission',
        tenantMatches: true,
        resourceExists: true,
        resourceStateAllows: true,
      }),
    ).toEqual({ allowed: false, reason: 'permission_missing' });
  });

  it.each([
    {
      name: 'assigned center',
      requestedCenterId: 'center-a',
      tenantMatches: true,
      resourceExists: true,
      resourceStateAllows: true,
      expected: { allowed: true },
    },
    {
      name: 'unassigned center',
      requestedCenterId: 'center-b',
      tenantMatches: true,
      resourceExists: true,
      resourceStateAllows: true,
      expected: { allowed: false, reason: 'scope_mismatch' },
    },
    {
      name: 'missing center',
      requestedCenterId: undefined,
      tenantMatches: true,
      resourceExists: true,
      resourceStateAllows: true,
      expected: { allowed: false, reason: 'scope_mismatch' },
    },
    {
      name: 'foreign tenant',
      requestedCenterId: 'center-a',
      tenantMatches: false,
      resourceExists: true,
      resourceStateAllows: true,
      expected: {
        allowed: false,
        reason: 'resource_missing_or_inaccessible',
      },
    },
    {
      name: 'missing resource',
      requestedCenterId: 'center-a',
      tenantMatches: true,
      resourceExists: false,
      resourceStateAllows: true,
      expected: {
        allowed: false,
        reason: 'resource_missing_or_inaccessible',
      },
    },
    {
      name: 'invalid resource state',
      requestedCenterId: 'center-a',
      tenantMatches: true,
      resourceExists: true,
      resourceStateAllows: false,
      expected: { allowed: false, reason: 'resource_state_invalid' },
    },
  ])('$name', ({ expected, requestedCenterId, ...input }) => {
    expect(
      authorizeIamMembership({
        membershipStatus: 'active',
        roles: [IAM_ROLES.centerManager],
        centerIds: ['center-a'],
        permission: 'center.read',
        ...input,
        ...(requestedCenterId === undefined ? {} : { requestedCenterId }),
      }),
    ).toEqual(expected);
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

  it('publishes the complete stable permission catalog', () => {
    expect(IAM_PERMISSIONS).toEqual([
      'center.read',
      'booking_service.create',
      'booking_service.read',
      'booking_service.update',
      'booking_service.publish',
      'availability.read',
      'availability.manage',
      'booking.create',
      'booking.read',
      'booking.update',
      'booking.confirm',
      'booking.cancel',
      'calendar.read',
      'customer_contact.read',
      'audit.read',
      'audit.export',
      'membership.invite',
      'membership.disable',
      'membership.read',
      'channel.read',
      'channel.manage',
      'support.tenant.read',
    ]);
    expect(permissionsForRoles([IAM_ROLES.tenantOwner])).not.toContain(
      'support.tenant.read',
    );
  });

  it.each([
    [IAM_ROLES.operationsLead, 'booking_service.publish', true],
    [IAM_ROLES.auditorCompliance, 'booking_service.read', true],
    [IAM_ROLES.auditorCompliance, 'booking_service.update', false],
    [IAM_ROLES.centerManager, 'channel.manage', true],
    [IAM_ROLES.receptionBookingManager, 'booking_service.read', true],
    [IAM_ROLES.receptionBookingManager, 'booking_service.update', false],
  ] as const)('maps %s to %s = %s', (role, permission, expected) => {
    expect(permissionsForRoles([role]).has(permission)).toBe(expected);
  });

  it.each([
    IAM_ROLES.tenantOwner,
    IAM_ROLES.tenantAdmin,
    IAM_ROLES.operationsLead,
    IAM_ROLES.auditorCompliance,
    IAM_ROLES.centerManager,
    IAM_ROLES.receptionBookingManager,
  ])('withholds purpose-limited customer contact access from %s', (role) => {
    expect(permissionsForRoles([role])).not.toContain('customer_contact.read');
  });

  it.each([
    IAM_ROLES.tenantOwner,
    IAM_ROLES.tenantAdmin,
    IAM_ROLES.operationsLead,
    IAM_ROLES.auditorCompliance,
    IAM_ROLES.centerManager,
    IAM_ROLES.receptionBookingManager,
  ])('withholds deferred audit export from %s', (role) => {
    expect(permissionsForRoles([role])).not.toContain('audit.export');
  });

  it('keeps a granting role center-scoped when combined with an unrelated tenant-wide role', () => {
    const membership = {
      membershipStatus: 'active',
      roles: [IAM_ROLES.auditorCompliance, IAM_ROLES.centerManager],
      centerIds: ['center-a'],
      permission: 'booking.update',
      tenantMatches: true,
      resourceExists: true,
      resourceStateAllows: true,
    } as const;

    expect(
      authorizeIamMembership({
        ...membership,
        requestedCenterId: 'center-a',
      }),
    ).toEqual({ allowed: true });
    expect(
      authorizeIamMembership({
        ...membership,
        requestedCenterId: 'center-b',
      }),
    ).toEqual({ allowed: false, reason: 'scope_mismatch' });
  });

  it.each([
    { roles: [IAM_ROLES.externalCollaborator] },
    { roles: ['unknown_role'] },
    { roles: [IAM_ROLES.tenantOwner, IAM_ROLES.externalCollaborator] },
    { roles: [IAM_ROLES.tenantOwner, 'unknown_role'] },
  ])('fails closed for disabled or unknown role $roles', ({ roles }) => {
    expect([...permissionsForRoles(roles)]).toEqual([]);
    expect(hasTenantWideScope(roles)).toBe(false);
  });
});
