import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardContextProvider } from './dashboard-context';
import { DashboardWorkspace } from './dashboard-workspace';
import type { DashboardApi } from './tenant-context';

let pathname = '/dashboard';
let searchParamsValue = 'center=center-b';
const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(searchParamsValue),
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

const allowed = {
  canReadActivities: true,
  canReadSessions: true,
  canCreateActivity: false,
  canUpdateActivity: false,
  canPublishActivity: false,
  canScheduleSession: false,
};

function renderWorkspace(
  capabilities: typeof allowed,
  {
    centerSelectionMode = 'url',
    hasCenterRoute = true,
  }: { centerSelectionMode?: 'host' | 'url'; hasCenterRoute?: boolean } = {},
) {
  const getDashboardCapabilities = vi.fn().mockResolvedValue(capabilities);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DashboardContextProvider
        value={{
          api: { getDashboardCapabilities } as unknown as DashboardApi,
          apiBaseUrl: '/api/dashboard',
          session: { getToken: vi.fn() },
          tenantContext: 'ctx-private',
          authorizedCenters: [
            { id: 'center-a', name: 'Center A', timeZone: 'Europe/Madrid' },
            { id: 'center-b', name: 'Center B', timeZone: 'Europe/Madrid' },
          ],
          centerSelectionMode,
          sessionState: 'available',
          isReady: true,
          invalidateDashboardCache: vi.fn(),
          handleSessionExpired: vi.fn(),
          clearTenantContext: vi.fn(),
        }}
      >
        <DashboardWorkspace
          hasCenterRoute={hasCenterRoute}
          actions={<button type="button">Log out</button>}
        >
          <p>Route content</p>
        </DashboardWorkspace>
      </DashboardContextProvider>
    </QueryClientProvider>,
  );
  return getDashboardCapabilities;
}

describe('dashboard workspace navigation (DIVE-IAM-REQ-030..032)', () => {
  afterEach(() => {
    cleanup();
    pathname = '/dashboard';
    searchParamsValue = 'center=center-b';
    routerReplace.mockReset();
  });

  it('links permitted surfaces for the requested center and marks the current route', async () => {
    pathname = '/dashboard/calendar';
    const getDashboardCapabilities = renderWorkspace(allowed);

    expect(
      await screen.findByRole('link', { name: 'Calendar' }),
    ).toHaveAttribute('href', '/dashboard/calendar?center=center-b');
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Activities' })).toHaveAttribute(
      'href',
      '/dashboard/activities?center=center-b',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(getDashboardCapabilities).toHaveBeenCalledWith(
      'ctx-private',
      'center-b',
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Good morning',
    );
    expect(screen.getByText('Route content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('omits center query parameters on center-specific hosts and clears foreign input', async () => {
    pathname = '/dashboard/calendar';
    const getDashboardCapabilities = renderWorkspace(allowed, {
      centerSelectionMode: 'host',
    });

    expect(
      await screen.findByRole('link', { name: 'Calendar' }),
    ).toHaveAttribute('href', '/dashboard/calendar');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Activities' })).toHaveAttribute(
      'href',
      '/dashboard/activities',
    );
    expect(routerReplace).toHaveBeenCalledWith('/dashboard/calendar', {
      scroll: false,
    });
    expect(getDashboardCapabilities).toHaveBeenCalledWith(
      'ctx-private',
      'center-a',
      expect.any(AbortSignal),
    );
  });

  it('lets the workspace resolve an invalid center explicitly', () => {
    searchParamsValue =
      'center=center-foreign&activity=activity-foreign&activityPage=4&slotPage=3';
    renderWorkspace(allowed);

    expect(screen.getByText('Center unavailable')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Center' }), {
      target: { value: 'center-a' },
    });

    expect(routerReplace).toHaveBeenCalledWith('/dashboard?center=center-a', {
      scroll: false,
    });
  });

  it('omits surfaces the center capabilities do not allow', async () => {
    const getDashboardCapabilities = renderWorkspace({
      ...allowed,
      canReadActivities: false,
    });

    await vi.waitFor(() => expect(getDashboardCapabilities).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('link', { name: 'Calendar' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Activities' })).toBeNull();
  });

  it('does not request capabilities without a center route', () => {
    const getDashboardCapabilities = renderWorkspace(allowed, {
      hasCenterRoute: false,
    });

    expect(getDashboardCapabilities).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Calendar' })).toBeNull();
  });

  it('toggles the navigation drawer on narrow screens', () => {
    renderWorkspace(allowed);
    const toggle = screen.getByRole('button', { name: 'Open menu' });

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Close menu');
  });
});
