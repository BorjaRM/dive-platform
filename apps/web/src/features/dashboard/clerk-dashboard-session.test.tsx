import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClerkDashboardSession } from './clerk-dashboard-session';
import type { SessionTokenSource } from './tenant-context';

type DashboardProps = {
  apiBaseUrl: string;
  session: SessionTokenSource;
  centerKey?: string;
  onSessionExpired?: () => void;
};

const clerkMocks = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  signOut: vi.fn<() => Promise<void>>(),
  isLoaded: true,
  isSignedIn: true,
  sessionId: 'sid_alpha',
  redirectRenders: 0,
  redirectProps: [] as Array<Record<string, unknown>>,
}));
const dashboardMock = vi.hoisted(() => ({
  props: null as DashboardProps | null,
}));

vi.mock('@clerk/nextjs', () => ({
  RedirectToSignIn: (props: Record<string, unknown>) => {
    clerkMocks.redirectRenders += 1;
    clerkMocks.redirectProps.push(props);
    return null;
  },
  useAuth: () => ({
    getToken: clerkMocks.getToken,
    isLoaded: clerkMocks.isLoaded,
    isSignedIn: clerkMocks.isSignedIn,
    sessionId: clerkMocks.sessionId,
  }),
  useClerk: () => ({ signOut: clerkMocks.signOut }),
}));

vi.mock('./dashboard-tenant-context', () => ({
  DashboardTenantContext: (props: DashboardProps) => {
    dashboardMock.props = props;
    return null;
  },
}));

describe('ClerkDashboardSession', () => {
  it('preserves the validated center return on the primary sign-in host (DIVE-IAM-REQ-032)', () => {
    clerkMocks.isSignedIn = false;
    render(
      <ClerkDashboardSession
        apiBaseUrl="/api"
        centerKey="alpha"
        centerReturnUrl="https://alpha.app.example.test/dashboard"
      />,
    );
    expect(clerkMocks.redirectProps).toEqual([
      { signInForceRedirectUrl: 'https://alpha.app.example.test/dashboard' },
    ]);
    expect(dashboardMock.props).toBeNull();
  });

  it('passes only the origin-derived center key to the existing context owner', () => {
    render(<ClerkDashboardSession apiBaseUrl="/api" centerKey="alpha" />);
    expect(dashboardMock.props?.centerKey).toBe('alpha');
  });

  it('returns an expired center session to sign-in with its destination preserved', async () => {
    render(
      <ClerkDashboardSession
        apiBaseUrl="/api"
        centerKey="alpha"
        centerReturnUrl="https://alpha.app.example.test/dashboard"
      />,
    );
    await act(async () => dashboardMock.props?.onSessionExpired?.());
    expect(clerkMocks.redirectProps).toEqual([
      { signInForceRedirectUrl: 'https://alpha.app.example.test/dashboard' },
    ]);
  });

  afterEach(() => {
    dashboardMock.props = null;
    clerkMocks.getToken.mockReset();
    clerkMocks.signOut.mockReset();
    clerkMocks.isLoaded = true;
    clerkMocks.isSignedIn = true;
    clerkMocks.sessionId = 'sid_alpha';
    clerkMocks.redirectRenders = 0;
    clerkMocks.redirectProps = [];
  });

  it('waits for Clerk before rendering the dashboard (DIVE-IAM-REQ-004)', () => {
    clerkMocks.isLoaded = false;
    clerkMocks.isSignedIn = false;

    render(<ClerkDashboardSession apiBaseUrl="/api" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your session',
    );
    expect(dashboardMock.props).toBeNull();
    expect(clerkMocks.redirectRenders).toBe(0);
  });

  it('redirects a signed-out visitor before rendering tenant data (DIVE-IAM-REQ-004, DIVE-IAM-REQ-032)', () => {
    clerkMocks.isSignedIn = false;

    render(<ClerkDashboardSession apiBaseUrl="/api" />);

    expect(clerkMocks.redirectRenders).toBe(1);
    expect(clerkMocks.redirectProps).toEqual([{}]);
    expect(dashboardMock.props).toBeNull();
  });

  it('bridges signed-in Clerk credentials and preserves the session source identity (DIVE-IAM-REQ-004, DIVE-IAM-REQ-022)', async () => {
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

  it('renews the session source when the Clerk sid changes so the provider clears previous context and cache', () => {
    const view = render(
      <ClerkDashboardSession apiBaseUrl="/api" centerKey="alpha" />,
    );
    const previousSession = dashboardMock.props?.session;
    clerkMocks.sessionId = 'sid_beta';
    view.rerender(
      <ClerkDashboardSession apiBaseUrl="/api" centerKey="alpha" />,
    );
    expect(dashboardMock.props?.session).not.toBe(previousSession);
  });
});
