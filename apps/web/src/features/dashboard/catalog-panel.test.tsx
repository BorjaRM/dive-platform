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
    getCatalogSettings: vi
      .fn<DashboardApi['getCatalogSettings']>()
      .mockResolvedValue({ defaultActivityLocale: 'es' }),
    selectCatalogLanguage: vi.fn().mockResolvedValue(undefined),
    listOperators: vi.fn().mockResolvedValue({ operators: [] }),
    issueTenantContext: vi.fn().mockResolvedValue({
      tenantContext: 'ctx_alpha',
    }),
    issueCenterEntryContext: vi.fn().mockResolvedValue({
      tenantContext: 'ctx_alpha',
      center: { centerId: 'center-alpha' },
    }),
    getCenter: vi
      .fn()
      .mockResolvedValue({ id: 'center-alpha', name: 'Alpha Center' }),
    revokeTenantContext: vi.fn().mockResolvedValue(undefined),
    listCenters: vi.fn().mockResolvedValue([]),
    listActivities: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'activity-alpha',
          status: 'Draft',
          baseLocale: 'es',
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
  } satisfies DashboardApi;
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

  it('requires an explicit center language before creating a monolingual activity (DIVE-BOOK-REQ-009, 051)', async () => {
    const api = createApi();
    api.getCatalogSettings.mockResolvedValue({
      defaultActivityLocale: null,
    } as never);
    api.selectCatalogLanguage.mockImplementation(async () => {
      api.getCatalogSettings.mockResolvedValue({ defaultActivityLocale: 'en' });
    });
    renderCatalog(api);
    const language = await screen.findByLabelText('Catalog language');
    expect(language).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Create activity' }),
    ).toBeDisabled();
    expect(api.selectCatalogLanguage).not.toHaveBeenCalled();
    fireEvent.change(language, { target: { value: 'en' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save catalog language' }),
    );
    await screen.findByText('Catalog language: English');
    expect(api.selectCatalogLanguage).toHaveBeenCalledWith(
      'ctx_alpha',
      'center-alpha',
      'en',
    );
    expect(screen.queryByLabelText('Catalog language')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name · ES'), {
      target: { value: 'Traduccion' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    await screen.findByText('Add the activity name in English.');
    expect(api.createActivity).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Name · ES'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Name · EN'), {
      target: { value: 'Diving' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    await waitFor(() =>
      expect(api.createActivity).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        { name: { en: 'Diving' } },
      ),
    );
  });

  it('refreshes a competing language selection instead of overriding the server (DIVE-BOOK-REQ-056)', async () => {
    const api = createApi();
    api.getCatalogSettings.mockResolvedValueOnce({
      defaultActivityLocale: null,
    } as never);
    api.selectCatalogLanguage.mockRejectedValue(
      new DashboardApiError(409, 'unknown', {
        code: 'center_catalog_locale_locked',
      }),
    );
    renderCatalog(api);
    fireEvent.change(await screen.findByLabelText('Catalog language'), {
      target: { value: 'en' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save catalog language' }),
    );
    await screen.findByText('Catalog language: Spanish');
    expect(screen.queryByLabelText('Catalog language')).not.toBeInTheDocument();
    expect(api.selectCatalogLanguage).toHaveBeenCalledTimes(1);
    expect(api.createActivity).not.toHaveBeenCalled();
  });

  it('does not reuse a previous center language or activity draft (DIVE-BOOK-REQ-050, MT-REQ-010)', async () => {
    const api = createApi();
    api.getCatalogSettings.mockImplementation(
      async (_context, centerId) =>
        ({
          defaultActivityLocale: centerId === 'center-alpha' ? 'es' : null,
        }) as never,
    );
    renderCatalog(api);
    await screen.findByText('Catalog language: Spanish');
    fireEvent.change(screen.getByLabelText('Name · ES'), {
      target: { value: 'Old draft' },
    });
    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: 'center-beta' },
    });
    expect(await screen.findByLabelText('Catalog language')).toHaveValue('');
    expect(screen.getByLabelText('Name · ES')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Create activity' }),
    ).toBeDisabled();
    expect(api.createActivity).not.toHaveBeenCalled();
  });

  it('fails closed when catalog configuration cannot be read', async () => {
    const api = createApi();
    api.getCatalogSettings.mockRejectedValue(
      new DashboardApiError(403, 'unknown', { code: 'permission_denied' }),
    );
    renderCatalog(api);
    await screen.findByText('Catalog language unavailable');
    expect(
      screen.getByRole('button', { name: 'Create activity' }),
    ).toBeDisabled();
    expect(screen.queryByLabelText('Catalog language')).not.toBeInTheDocument();
  });

  it('resolves fields independently and never fills raw translations (DIVE-BOOK-REQ-009, 053)', async () => {
    const api = createApi();
    const items = [
      {
        id: 'translated',
        status: 'Draft' as const,
        baseLocale: 'es' as const,
        name: { es: 'Buceo', en: 'Diving' },
        description: { es: 'Descripcion base' },
        createdAt: '2026-09-27T10:00:00Z',
      },
      {
        id: 'english',
        status: 'Draft' as const,
        baseLocale: 'en' as const,
        name: { en: 'Freediving' },
        description: { es: 'Not a third fallback' },
        createdAt: '2026-09-27T10:00:00Z',
      },
    ];
    const before = structuredClone(items);
    api.listActivities.mockResolvedValue({
      items,
      page: 1,
      pageSize: 10,
      hasNext: false,
    } as never);
    renderCatalog(api);
    await screen.findByText('Diving');
    expect(screen.getByText('Descripcion base')).toBeInTheDocument();
    expect(screen.queryByText('Not a third fallback')).not.toBeInTheDocument();
    expect(screen.queryByText('Buceo')).not.toBeInTheDocument();
    expect(items).toEqual(before);
    expect(api.createActivity).not.toHaveBeenCalled();
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
      await screen.findByText('Add the activity name in Spanish.'),
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
            baseLocale: 'es',
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
