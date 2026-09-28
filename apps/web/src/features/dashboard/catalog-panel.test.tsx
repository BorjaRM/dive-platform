import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogPanel } from './catalog-panel';
import { DashboardContextProvider } from './dashboard-context';
import { type DashboardApi, DashboardApiError } from './tenant-context';

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const router = {
    replace: (href: string) => {
      const url = new URL(href, window.location.origin);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
  };

  return {
    usePathname: () => '/dashboard',
    useRouter: () => router,
    useSearchParams: () => {
      const search = useSyncExternalStore(
        (onStoreChange) => {
          window.addEventListener('popstate', onStoreChange);
          return () => window.removeEventListener('popstate', onStoreChange);
        },
        () => window.location.search,
        () => '',
      );
      return new URLSearchParams(search);
    },
  };
});

function createApi() {
  return {
    listActivities: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'activity-alpha',
          status: 'Draft',
          name: { es: 'Buceo nocturno' },
          createdAt: '2026-09-27T10:00:00Z',
        },
      ],
      page: 1,
      pageSize: 10,
      hasNext: false,
    }),
    listSlots: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'slot-alpha',
          activityId: 'activity-alpha',
          status: 'Available',
          startsAt: '2026-10-01T10:00:00Z',
          durationMinutes: 60,
          capacity: 8,
          createdAt: '2026-09-27T10:00:00Z',
        },
      ],
      page: 1,
      pageSize: 10,
      hasNext: false,
    }),
    createActivity: vi.fn().mockResolvedValue({}),
    publishActivity: vi.fn().mockResolvedValue(undefined),
    disableActivity: vi.fn().mockResolvedValue(undefined),
    createSlot: vi.fn().mockResolvedValue({}),
    closeSlot: vi.fn().mockResolvedValue(undefined),
    cancelSlot: vi.fn().mockResolvedValue(undefined),
  } as unknown as DashboardApi;
}

function renderCatalog(api: DashboardApi, handleSessionExpired = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardContextProvider
        value={{
          api,
          apiBaseUrl: 'https://api.example.test',
          session: { getToken: vi.fn() },
          tenantContext: 'ctx_alpha',
          authorizedCenters: [
            { id: 'center-alpha', name: 'Alpha Center' },
            { id: 'center-beta', name: 'Beta Center' },
          ],
          sessionState: 'available',
          isReady: true,
          invalidateDashboardCache: vi.fn(),
          handleSessionExpired,
          clearTenantContext: vi.fn(),
        }}
      >
        <CatalogPanel />
      </DashboardContextProvider>
    </QueryClientProvider>,
  );
}

describe('dashboard catalog panel', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/dashboard');
  });

  it('loads the selected authorized center and its activity-scoped slots', async () => {
    const api = createApi();
    renderCatalog(api);

    expect(await screen.findByText('Buceo nocturno')).toBeInTheDocument();
    expect(
      await screen.findByText('Slots for Buceo nocturno'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(api.listActivities).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        { page: 1, pageSize: 10 },
        expect.any(AbortSignal),
      );
      expect(api.listSlots).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        { page: 1, pageSize: 10 },
        expect.any(AbortSignal),
      );
    });

    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: 'center-beta' },
    });

    await waitFor(() => {
      expect(api.listActivities).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-beta',
        { page: 1, pageSize: 10 },
        expect.any(AbortSignal),
      );
    });
  });

  it('creates an activity without adding client-owned selectors to the body', async () => {
    const api = createApi();
    renderCatalog(api);

    await screen.findByText('Buceo nocturno');
    fireEvent.change(screen.getByLabelText('Name · ES'), {
      target: { value: 'Curso de apnea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => {
      expect(api.createActivity).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        { name: { es: 'Curso de apnea' } },
      );
    });
    expect(await screen.findByText('Activity created.')).toBeInTheDocument();
  });

  it('validates activity and slot drafts before sending commands', async () => {
    const api = createApi();
    renderCatalog(api);

    await screen.findByText('Buceo nocturno');
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    expect(
      await screen.findByText('Add the activity name in Spanish or English.'),
    ).toBeInTheDocument();
    expect(api.createActivity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Create slot' }));
    expect(
      await screen.findByText(
        'Add an RFC3339 start instant, including its offset.',
      ),
    ).toBeInTheDocument();
    expect(api.createSlot).not.toHaveBeenCalled();
  });

  it('keeps pagination and status filters in the activity list request', async () => {
    const api = createApi();
    vi.mocked(api.listActivities).mockImplementation(
      async (_tenantContext, _centerId, query = {}) => ({
        items: [
          {
            id: `activity-page-${query.page ?? 1}`,
            status: query.status ?? 'Draft',
            name: { es: `Actividad ${query.page ?? 1}` },
            createdAt: '2026-09-27T10:00:00Z',
          },
        ],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 10,
        hasNext: query.status === undefined && query.page === 1,
      }),
    );
    renderCatalog(api);

    const activitiesRegion = screen.getByRole('region', {
      name: 'Activities',
    });
    expect(
      await within(activitiesRegion).findByText('Actividad 1'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(activitiesRegion).getByRole('button', { name: 'Next' }),
    );

    await waitFor(() => {
      expect(api.listActivities).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        { page: 2, pageSize: 10 },
        expect.any(AbortSignal),
      );
    });
    expect(window.location.search).toContain('center=center-alpha');

    fireEvent.change(within(activitiesRegion).getByLabelText('Status'), {
      target: { value: 'Published' },
    });
    await waitFor(() => {
      expect(api.listActivities).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        { page: 1, pageSize: 10, status: 'Published' },
        expect.any(AbortSignal),
      );
    });
    expect(window.location.search).toContain('activityStatus=Published');
    expect(window.location.search).not.toContain('activityPage=');
    expect(within(activitiesRegion).getByText('Page 1')).toBeInTheDocument();
  });

  it('renders only the stable problem code for catalog errors', async () => {
    const api = createApi();
    vi.mocked(api.listActivities).mockRejectedValue(
      new DashboardApiError(404, 'unknown', {
        code: 'resource_not_found',
        detail: 'activity belongs to another center',
      }),
    );
    renderCatalog(api);

    expect(
      await screen.findByText('Activities could not be loaded'),
    ).toBeInTheDocument();
    expect(screen.getByText('resource_not_found')).toBeInTheDocument();
    expect(
      screen.queryByText('activity belongs to another center'),
    ).not.toBeInTheDocument();
  });

  it('delegates an expired catalog session to the dashboard context', async () => {
    const api = createApi();
    const handleSessionExpired = vi.fn();
    vi.mocked(api.listActivities).mockRejectedValue(
      new DashboardApiError(401, 'session-expired'),
    );
    renderCatalog(api, handleSessionExpired);

    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalledOnce());
  });

  it('publishes activities and closes slots through typed commands', async () => {
    const api = createApi();
    renderCatalog(api);

    await screen.findByText('Buceo nocturno');
    await screen.findByText('2026-10-01T10:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(api.publishActivity).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(api.closeSlot).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'slot-alpha',
      );
    });
  });

  it('creates a slot with the explicit RFC3339 instant entered by the operator', async () => {
    const api = createApi();
    renderCatalog(api);

    await screen.findByText('Slots for Buceo nocturno');
    fireEvent.change(screen.getByLabelText('Starts at · RFC3339'), {
      target: { value: '2026-10-01T10:00:00+02:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create slot' }));

    await waitFor(() => {
      expect(api.createSlot).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        {
          startsAt: '2026-10-01T10:00:00+02:00',
          durationMinutes: 60,
          capacity: 8,
        },
      );
    });
  });
});
