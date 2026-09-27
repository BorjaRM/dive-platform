export function dashboardCenterPath(
  tenantId: string,
  centerId: string,
): string {
  return `/v1/tenants/${tenantId}/centers/${centerId}`;
}
