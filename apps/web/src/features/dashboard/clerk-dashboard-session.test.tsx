import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClerkDashboardSession } from './clerk-dashboard-session';
import type { SessionTokenSource } from './tenant-context';

type DashboardProps = {
  apiBaseUrl: string;
  session: SessionTokenSource;
};

const clerkMocks = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  signOut: vi.fn<() => Promise<void>>(),
}));
const dashboardMock = vi.hoisted(() => ({
  props: null as DashboardProps | null,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: clerkMocks.getToken }),
  useClerk: () => ({ signOut: clerkMocks.signOut }),
}));

vi.mock('./dashboard-tenant-context', () => ({
  DashboardTenantContext: (props: DashboardProps) => {
    dashboardMock.props = props;
    return null;
  },
}));

describe('ClerkDashboardSession', () => {
  afterEach(() => {
    dashboardMock.props = null;
    clerkMocks.getToken.mockReset();
    clerkMocks.signOut.mockReset();
  });

  it('bridges Clerk credentials and preserves the session source identity (DIVE-IAM-REQ-004, DIVE-IAM-REQ-022)', async () => {
    clerkMocks.getToken.mockResolvedValue('clerk-session');
    clerkMocks.signOut.mockResolvedValue(undefined);

    const view = render(<ClerkDashboardSession apiBaseUrl="/api" />);
    const firstSession = dashboardMock.props?.session;

    expect(dashboardMock.props?.apiBaseUrl).toBe('/api');
    expect(firstSession?.configured).toBe(true);
    expect(firstSession).toBeDefined();
    if (!firstSession) throw new Error('Expected a Clerk session source');

    await expect(firstSession.getToken()).resolves.toBe('clerk-session');
    await firstSession.logout?.();
    expect(clerkMocks.signOut).toHaveBeenCalledOnce();

    view.rerender(<ClerkDashboardSession apiBaseUrl="/api" />);
    expect(dashboardMock.props?.session).toBe(firstSession);
  });
});
