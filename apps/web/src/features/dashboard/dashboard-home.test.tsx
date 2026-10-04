import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardContextProvider } from './dashboard-context';
import { DashboardHome } from './dashboard-home';
import { type DashboardApi, DashboardApiError } from './tenant-context';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const capabilities = {
  canReadActivities: true,
  canReadSessions: true,
  canCreateActivity: true,
  canUpdateActivity: true,
  canPublishActivity: true,
  canScheduleSession: true,
};

function createApi() {
  return {
    getDashboardCapabilities: vi.fn().mockResolvedValue(capabilities),
    listActivities: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'activity-a',
          name: { es: 'Buceo' },
          baseLocale: 'es',
          status: 'Published',
        },
      ],
      hasNext: false,
    }),
    listSlots: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'slot-a',
          activityId: 'activity-a',
          startsAt: '2026-10-01T10:00:00Z',
          durationMinutes: 60,
          capacity: 8,
          status: 'Available',
        },
      ],
      hasNext: false,
    }),
  };
}

function renderHome(
  api: ReturnType<typeof createApi>,
  options: {
    timeZone?: string | null;
    handleSessionExpired?: () => void;
    ready?: boolean;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <DashboardContextProvider
        value={{
          api: api as unknown as DashboardApi,
          apiBaseUrl: '/api/dashboard',
          session: { getToken: vi.fn() },
          tenantContext: 'ctx-private',
          authorizedCenters: [
            {
              id: 'center-a',
              name: 'Center A',
              timeZone:
                options.timeZone === undefined
                  ? 'Europe/Madrid'
                  : options.timeZone,
            },
          ],
          sessionState: 'available',
          isReady: options.ready ?? true,
          invalidateDashboardCache: vi.fn(),
          handleSessionExpired: options.handleSessionExpired ?? vi.fn(),
          clearTenantContext: vi.fn(),
        }}
      >
        <DashboardHome />
      </DashboardContextProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe('center home (DIVE-IAM-REQ-030..032, DIVE-BOOK-REQ-049)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'));
    window.history.replaceState(null, '', '/dashboard');
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the center, local date/time, permitted actions and separate calendar navigation', async () => {
    const api = createApi();
    const { queryClient } = renderHome(api);
    expect(await screen.findByRole('link', { name: 'Buceo' })).toHaveAttribute(
      'href',
      '/dashboard/activities/activity-a/edit?center=center-a',
    );
    expect(
      screen.getByRole('heading', { name: 'Center A' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Thursday, October 1, 2026/)).toHaveTextContent(
      'Europe/Madrid',
    );
    expect(
      screen.getByText(/Oct 1, 2026, 12:00 UTC\+02:00/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create activity' }),
    ).toHaveAttribute('href', '/dashboard/activities/new?center=center-a');
    expect(
      screen.getByRole('link', { name: 'Schedule session' }),
    ).toHaveAttribute('href', '/dashboard/activities?center=center-a');
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      '/dashboard/calendar?center=center-a',
    );
    expect(screen.queryByLabelText('Center')).not.toBeInTheDocument();
    expect(api.listSlots).toHaveBeenCalledWith(
      'ctx-private',
      'center-a',
      'activity-a',
      { page: 1, pageSize: 5, from: '2026-10-01T09:00:00.000Z' },
      expect.any(AbortSignal),
    );
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
      ),
    ).not.toContain('ctx-private');
  });

  it('does not show write actions while permissions load or for a read-only user', async () => {
    const api = createApi();
    let resolve!: (value: typeof capabilities) => void;
    api.getDashboardCapabilities.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderHome(api);
    expect(
      screen.queryByRole('link', { name: 'Create activity' }),
    ).not.toBeInTheDocument();
    expect(api.listActivities).not.toHaveBeenCalled();
    resolve({
      ...capabilities,
      canCreateActivity: false,
      canScheduleSession: false,
    });
    await screen.findByRole('link', { name: 'Buceo' });
    expect(
      screen.queryByRole('link', { name: 'Create activity' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Schedule session' }),
    ).not.toBeInTheDocument();
  });

  it('distinguishes no activities from no upcoming sessions', async () => {
    const api = createApi();
    api.listActivities.mockResolvedValue({ items: [], hasNext: false });
    renderHome(api);
    await screen.findByText('No activities yet');
    expect(api.listSlots).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('link', { name: 'Schedule session' }),
    ).not.toBeInTheDocument();
    cleanup();
    const scheduled = createApi();
    scheduled.listSlots.mockResolvedValue({ items: [], hasNext: false });
    renderHome(scheduled);
    await screen.findByText('No upcoming sessions');
    expect(
      screen.getByRole('link', { name: 'Schedule session' }),
    ).toBeInTheDocument();
  });

  it('does not turn denied read permissions into an empty center', async () => {
    const api = createApi();
    api.getDashboardCapabilities.mockResolvedValue({
      ...capabilities,
      canReadActivities: false,
      canReadSessions: false,
      canCreateActivity: false,
      canScheduleSession: false,
    });
    renderHome(api);
    await screen.findByText('Activity access is unavailable');
    expect(api.listActivities).not.toHaveBeenCalled();
    expect(api.listSlots).not.toHaveBeenCalled();
    expect(screen.queryByText('No activities yet')).not.toBeInTheDocument();
  });

  it('reports failures without displaying an empty or partial list', async () => {
    const api = createApi();
    api.listSlots.mockRejectedValue(new DashboardApiError(503, 'unavailable'));
    renderHome(api);
    await screen.findByText('Upcoming sessions could not be loaded');
    expect(screen.queryByText('No upcoming sessions')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Buceo' }),
    ).not.toBeInTheDocument();
  });

  it('fails closed when workspace permissions cannot be loaded', async () => {
    const api = createApi();
    api.getDashboardCapabilities.mockRejectedValue(
      new DashboardApiError(503, 'unavailable'),
    );
    renderHome(api);
    await screen.findByText('Workspace permissions could not be loaded');
    expect(api.listActivities).not.toHaveBeenCalled();
    expect(api.listSlots).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('link', { name: 'Create activity' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Schedule session' }),
    ).not.toBeInTheDocument();
  });

  it('does not treat a failed activity read as an empty catalog', async () => {
    const api = createApi();
    api.listActivities.mockRejectedValue(
      new DashboardApiError(503, 'unavailable'),
    );
    renderHome(api);
    await screen.findByText('Activities could not be loaded');
    expect(api.listSlots).not.toHaveBeenCalled();
    expect(screen.queryByText('No activities yet')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Schedule session' }),
    ).not.toBeInTheDocument();
  });

  it('cancels a pending permission request when its scoped screen unmounts', () => {
    const api = createApi();
    let requestSignal: AbortSignal | undefined;
    api.getDashboardCapabilities.mockImplementation(
      async (_context, _center, signal: AbortSignal) => {
        requestSignal = signal;
        return new Promise(() => {});
      },
    );
    const { unmount } = renderHome(api);
    expect(requestSignal?.aborted).toBe(false);
    unmount();
    expect(requestSignal?.aborted).toBe(true);
    expect(api.listActivities).not.toHaveBeenCalled();
  });

  it('uses only the authorized center despite a foreign selector', async () => {
    window.history.replaceState(null, '', '/dashboard?center=foreign');
    const api = createApi();
    renderHome(api);
    await screen.findByRole('link', { name: 'Buceo' });
    expect(api.getDashboardCapabilities).toHaveBeenCalledWith(
      'ctx-private',
      'center-a',
      expect.any(AbortSignal),
    );
  });

  it('does not load sessions without a valid center timezone', async () => {
    const api = createApi();
    renderHome(api, { timeZone: null });
    await screen.findByText('Center time zone is not configured');
    expect(api.listSlots).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('link', { name: 'Schedule session' }),
    ).not.toBeInTheDocument();
  });

  it('propagates session expiry through the owning context', async () => {
    const api = createApi();
    api.getDashboardCapabilities.mockRejectedValue(
      new DashboardApiError(401, 'session-expired'),
    );
    const handleSessionExpired = vi.fn();
    renderHome(api, { handleSessionExpired });
    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalled());
    expect(
      screen.queryByRole('link', { name: 'Create activity' }),
    ).not.toBeInTheDocument();
  });
});
