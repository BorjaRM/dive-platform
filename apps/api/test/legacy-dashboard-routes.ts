export function legacyDashboardCenterPath(
  tenantId: string,
  centerId: string,
): string {
  void tenantId;
  return `/v1/centers/${centerId}`;
}
