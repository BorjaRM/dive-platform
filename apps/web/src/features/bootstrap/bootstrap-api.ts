export type BootstrapSetupInput = Readonly<{
  operatorDisplayName: string;
  centerDisplayName: string;
  timeZone: string;
  locale: 'en' | 'es';
}>;

export type BootstrapSetupResult = Readonly<{
  tenantId: string;
  centerId: string;
  membershipId: string;
  centerKey: string;
}>;

export class BootstrapApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'BootstrapApiError';
  }
}

export async function completeTenantBootstrap({
  apiBaseUrl,
  getToken,
  input,
}: Readonly<{
  apiBaseUrl: string;
  getToken: () => Promise<string | null>;
  input: BootstrapSetupInput;
}>): Promise<BootstrapSetupResult> {
  const token = await getToken();
  if (!token) throw new BootstrapApiError(401, 'session_expired');

  const response = await fetch(
    `${apiBaseUrl.replace(/\/$/, '')}/v1/me/tenant-bootstrap`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    let code = 'bootstrap_unavailable';
    if (
      response.headers.get('content-type')?.includes('application/problem+json')
    ) {
      const problem: unknown = await response
        .clone()
        .json()
        .catch(() => undefined);
      if (problem && typeof problem === 'object' && 'code' in problem) {
        const candidate = (problem as { code?: unknown }).code;
        if (typeof candidate === 'string') code = candidate;
      }
    }
    throw new BootstrapApiError(response.status, code);
  }
  return (await response.json()) as BootstrapSetupResult;
}
