import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogPanel, type CatalogView } from './catalog-panel';
import { DashboardContextProvider } from './dashboard-context';
import { type DashboardApi, DashboardApiError } from './tenant-context';

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const router = {
    push: (href: string) => router.replace(href),
    replace: (href: string) => {
      const url = new URL(href, window.location.origin);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
  };

  return {
    usePathname: () =>
      useSyncExternalStore(
        (onStoreChange) => {
          window.addEventListener('popstate', onStoreChange);
          return () => window.removeEventListener('popstate', onStoreChange);
        },
        () => window.location.pathname,
        () => '/dashboard/activities',
      ),
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
    getDashboardCapabilities: vi.fn().mockResolvedValue({
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: true,
      canUpdateActivity: true,
      canPublishActivity: true,
      canScheduleSession: true,
    }),
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
    getActivity: vi.fn().mockResolvedValue({
      activity: {
        id: 'activity-alpha',
        status: 'Draft',
        baseLocale: 'es',
        name: { es: 'Buceo nocturno' },
        createdAt: '2026-09-27T10:00:00Z',
      },
      etag: '"activity-alpha-r1"',
    }),
    updateActivity: vi.fn().mockResolvedValue('"activity-alpha-r2"'),
    publishActivity: vi.fn().mockResolvedValue(undefined),
    disableActivity: vi.fn().mockResolvedValue(undefined),
    createSlot: vi.fn().mockResolvedValue({}),
    listCalendarSlots: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      hasNext: false,
      asOf: '2026-10-01T00:00:00Z',
    }),
    listSlotBookings: vi
      .fn()
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, hasNext: false }),
    getBookingContact: vi.fn(),
    closeSlot: vi.fn().mockResolvedValue(undefined),
    cancelSlot: vi.fn().mockResolvedValue(undefined),
  } satisfies DashboardApi;
}

function renderCatalog(
  api: DashboardApi,
  handleSessionExpired = vi.fn(),
  timeZone: string | null = 'Europe/Madrid',
  view: CatalogView = { kind: 'create' },
) {
  const path =
    view.kind === 'edit'
      ? `/dashboard/activities/${view.activityId}/edit`
      : view.kind === 'create'
        ? '/dashboard/activities/new'
        : '/dashboard/activities';
  window.history.replaceState(null, '', `${path}${window.location.search}`);
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
            { id: 'center-alpha', name: 'Alpha Center', timeZone },
            { id: 'center-beta', name: 'Beta Center', timeZone },
          ],
          sessionState: 'available',
          isReady: true,
          invalidateDashboardCache: vi.fn(),
          handleSessionExpired,
          clearTenantContext: vi.fn(),
        }}
      >
        <RoutedCatalog />
      </DashboardContextProvider>
    </QueryClientProvider>,
  );
}

function RoutedCatalog() {
  const path = usePathname();
  const activityId = path.split('/')[3];
  if (path.endsWith('/edit') && activityId)
    return <CatalogPanel view={{ kind: 'edit', activityId }} />;
  if (path.endsWith('/new')) return <CatalogPanel view={{ kind: 'create' }} />;
  return <CatalogPanel view={{ kind: 'list' }} />;
}

function renderSlotCatalog(
  api: DashboardApi,
  handleSessionExpired = vi.fn(),
  timeZone: string | null = 'Europe/Madrid',
) {
  renderCatalog(api, handleSessionExpired, timeZone, {
    kind: 'edit',
    activityId: 'activity-alpha',
  });
}

describe('dashboard catalog panel', () => {
  it('keeps Home and Calendar as separate destinations', async () => {
    renderCatalog(createApi(), vi.fn(), 'Europe/Madrid', { kind: 'list' });
    await screen.findByText('Buceo nocturno');
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(window.location.pathname).toBe('/dashboard/calendar');
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('shows only the list and navigates to creation with the selected center', async () => {
    const api = createApi();
    renderCatalog(api, vi.fn(), 'Europe/Madrid', { kind: 'list' });
    await screen.findByText('Buceo nocturno');
    expect(screen.queryByLabelText('Name · ES')).not.toBeInTheDocument();
    expect(api.listSlots).not.toHaveBeenCalled();
    expect(api.getCatalogSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    await screen.findByText('Catalog language: Spanish');
    expect(window.location.pathname).toBe('/dashboard/activities/new');
    expect(window.location.search).toContain('center=center-alpha');
  });

  it('opens an activity editor from the list while retaining its filters', async () => {
    const api = createApi();
    window.history.replaceState(
      null,
      '',
      '/dashboard?center=center-alpha&activityPage=2&activityStatus=Draft',
    );
    renderCatalog(api, vi.fn(), 'Europe/Madrid', { kind: 'list' });
    fireEvent.click(
      await screen.findByRole('button', { name: /Buceo nocturno/ }),
    );
    await screen.findByLabelText('Name');
    expect(window.location.pathname).toBe(
      '/dashboard/activities/activity-alpha/edit',
    );
    expect(window.location.search).toContain('activityPage=2');
    fireEvent.click(screen.getByRole('button', { name: 'Back to activities' }));
    await screen.findByText('Buceo nocturno');
    expect(window.location.pathname).toBe('/dashboard/activities');
  });

  it('shows activity details without mutation controls for a read-only membership', async () => {
    const api = createApi();
    api.getDashboardCapabilities.mockResolvedValue({
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: false,
      canUpdateActivity: false,
      canPublishActivity: false,
      canScheduleSession: false,
    });
    renderSlotCatalog(api);

    await screen.findByText('Activity details');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save translation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save common facts' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(api.updateActivity).not.toHaveBeenCalled();
  });

  it('waits for current values and revision when reopening a saved activity', async () => {
    const api = createApi();
    renderSlotCatalog(api);
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Nombre guardado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
    await screen.findByText('Activity saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Back to activities' }));
    await screen.findByText('Buceo nocturno');

    let releaseReload = () => {};
    api.getActivity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseReload = () =>
            resolve({
              activity: {
                id: 'activity-alpha',
                status: 'Draft',
                baseLocale: 'es',
                name: { es: 'Nombre guardado' },
                createdAt: '2026-09-27T10:00:00Z',
              },
              etag: '"activity-alpha-r2"',
            });
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Buceo nocturno/ }));
    await waitFor(() => expect(api.getActivity).toHaveBeenCalledTimes(2));
    const cachedEditorWasVisible = screen.queryByLabelText('Name') !== null;
    releaseReload();
    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveValue('Nombre guardado'),
    );
    expect(cachedEditorWasVisible).toBe(false);
    fireEvent.change(screen.getByLabelText('Default capacity'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save common facts' }));
    await waitFor(() =>
      expect(api.updateActivity).toHaveBeenLastCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        { group: 'common', values: { defaultCapacity: 8 } },
        '"activity-alpha-r2"',
      ),
    );
  });

  it('does not reuse a cached editor when the current read fails on reopening', async () => {
    const api = createApi();
    renderSlotCatalog(api);
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByRole('button', { name: 'Back to activities' }));
    await screen.findByText('Buceo nocturno');
    api.getActivity.mockRejectedValueOnce(
      new DashboardApiError(404, 'unknown', {
        code: 'resource_not_found',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Buceo nocturno/ }));
    await screen.findByText('Activity could not be loaded');
    expect(api.getActivity).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save translation' }),
    ).not.toBeInTheDocument();
    expect(api.updateActivity).not.toHaveBeenCalled();
    expect(api.listSlots).toHaveBeenCalledTimes(1);
  });

  it('navigates to the created activity instead of offering a bulk operation', async () => {
    const api = createApi();
    api.createActivity.mockResolvedValue({ id: 'activity-alpha' });
    renderCatalog(api);
    await screen.findByText('Catalog language: Spanish');
    fireEvent.change(screen.getByLabelText('Name · ES'), {
      target: { value: 'Nueva actividad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    await screen.findByLabelText('Name');
    expect(window.location.pathname).toBe(
      '/dashboard/activities/activity-alpha/edit',
    );
    expect(api.createActivity).toHaveBeenCalledTimes(1);
  });

  it('preloads authored values, retains language drafts and saves only the selected group', async () => {
    const api = createApi();
    renderSlotCatalog(api);
    expect(await screen.findByLabelText('Name')).toHaveValue('Buceo nocturno');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Borrador ES' },
    });
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'en' },
    });
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'English draft' },
    });
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'es' },
    });
    expect(screen.getByLabelText('Name')).toHaveValue('Borrador ES');
    fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
    await waitFor(() =>
      expect(api.updateActivity).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        {
          group: 'translation',
          locale: 'es',
          values: { name: 'Borrador ES', description: '' },
        },
        '"activity-alpha-r1"',
      ),
    );
    await screen.findByText('Activity saved.');
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'en' },
    });
    expect(screen.getByLabelText('Name')).toHaveValue('English draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save common facts' }));
    await waitFor(() =>
      expect(api.updateActivity).toHaveBeenLastCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        {
          group: 'common',
          values: { defaultCapacity: null },
        },
        '"activity-alpha-r2"',
      ),
    );
    expect(api.createActivity).not.toHaveBeenCalled();
    expect(api.publishActivity).not.toHaveBeenCalled();
  });

  it.each(['Draft', 'Published', 'Disabled'] as const)(
    'clears stored optional values through independent form saves in %s without publishing',
    async (status) => {
      const api = createApi();
      api.getActivity.mockResolvedValue({
        activity: {
          id: 'activity-alpha',
          status,
          baseLocale: 'es',
          name: { es: 'Buceo nocturno', en: 'Night diving' },
          description: { es: 'Descripcion guardada', en: 'Stored description' },
          defaultCapacity: 12,
          createdAt: '2026-09-27T10:00:00Z',
        },
        etag: '"activity-alpha-r1"',
      });
      renderSlotCatalog(api);
      expect(await screen.findByLabelText('Description')).toHaveValue(
        'Descripcion guardada',
      );
      expect(screen.getByLabelText('Default capacity')).toHaveValue(12);
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
      await screen.findByText('Activity saved.');
      expect(api.updateActivity).toHaveBeenLastCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        {
          group: 'translation',
          locale: 'es',
          values: { name: 'Buceo nocturno', description: '' },
        },
        '"activity-alpha-r1"',
      );
      expect(screen.getByLabelText('Default capacity')).toHaveValue(12);
      fireEvent.change(screen.getByLabelText('Language'), {
        target: { value: 'en' },
      });
      expect(screen.getByLabelText('Name')).toHaveValue('Night diving');
      expect(screen.getByLabelText('Description')).toHaveValue(
        'Stored description',
      );
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: '' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
      await waitFor(() => expect(api.updateActivity).toHaveBeenCalledTimes(2));
      await screen.findByText('Activity saved.');
      expect(api.updateActivity).toHaveBeenLastCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        {
          group: 'translation',
          locale: 'en',
          values: { name: '', description: '' },
        },
        '"activity-alpha-r2"',
      );
      fireEvent.change(screen.getByLabelText('Default capacity'), {
        target: { value: '' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Save common facts' }),
      );
      await waitFor(() => expect(api.updateActivity).toHaveBeenCalledTimes(3));
      expect(api.updateActivity).toHaveBeenLastCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        { group: 'common', values: { defaultCapacity: null } },
        '"activity-alpha-r2"',
      );
      fireEvent.change(screen.getByLabelText('Language'), {
        target: { value: 'es' },
      });
      expect(screen.getByLabelText('Name')).toHaveValue('Buceo nocturno');
      expect(api.createActivity).not.toHaveBeenCalled();
      expect(api.publishActivity).not.toHaveBeenCalled();
      expect(api.disableActivity).not.toHaveBeenCalled();
    },
  );

  it.each(['', '   '])(
    'rejects a blank base-language name on edit: %j',
    async (name) => {
      const api = createApi();
      renderSlotCatalog(api);
      await screen.findByLabelText('Name');
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: name },
      });
      fireEvent.submit(
        screen.getByRole('form', { name: 'Activity translation' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The base-language activity name is required.',
      );
      expect(screen.getByLabelText('Name')).toHaveValue(name);
      expect(api.updateActivity).not.toHaveBeenCalled();
    },
  );

  it.each(['0', '-1', '1.5', '9007199254740992'])(
    'rejects an invalid default capacity on edit without losing its draft: %s',
    async (capacity) => {
      const api = createApi();
      renderSlotCatalog(api);
      await screen.findByLabelText('Default capacity');
      fireEvent.change(screen.getByLabelText('Default capacity'), {
        target: { value: capacity },
      });
      fireEvent.submit(
        screen.getByRole('form', { name: 'Common activity facts' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Default capacity must be a positive whole number.',
      );
      expect(screen.getByLabelText('Default capacity')).toHaveValue(
        Number(capacity),
      );
      expect(api.updateActivity).not.toHaveBeenCalled();
    },
  );

  it('delegates an expired edit session without retrying or discarding the draft', async () => {
    const api = createApi();
    const handleSessionExpired = vi.fn();
    api.updateActivity.mockRejectedValue(
      new DashboardApiError(401, 'session-expired'),
    );
    renderSlotCatalog(api, handleSessionExpired);
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Unsaved name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalledOnce());
    expect(api.updateActivity).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved name');
  });

  it('retains drafts after a stale revision and requires an explicit reload', async () => {
    const api = createApi();
    api.updateActivity.mockRejectedValue(
      new DashboardApiError(412, 'unknown', {
        code: 'activity_revision_conflict',
      }),
    );
    renderSlotCatalog(api);
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Unsaved name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'activity_revision_conflict',
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved name');
    expect(api.updateActivity).toHaveBeenCalledTimes(1);
    expect(api.getActivity).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current activity' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveValue('Buceo nocturno'),
    );
    expect(api.getActivity).toHaveBeenCalledTimes(2);
  });

  it('preserves drafts and the precondition after a lost save response (DIVE-BOOK-REQ-078)', async () => {
    const api = createApi();
    api.updateActivity
      .mockRejectedValueOnce(new Error('Save response was lost'))
      .mockRejectedValueOnce(
        new DashboardApiError(412, 'unknown', {
          code: 'precondition_failed',
        }),
      );
    renderSlotCatalog(api);
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Unsaved translation' },
    });
    fireEvent.change(screen.getByLabelText('Default capacity'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your draft has been preserved.',
    );
    expect(api.updateActivity).toHaveBeenCalledTimes(1);
    expect(api.getActivity).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved translation');
    expect(screen.getByLabelText('Default capacity')).toHaveValue(8);

    fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'precondition_failed',
      ),
    );
    expect(api.updateActivity).toHaveBeenCalledTimes(2);
    expect(api.updateActivity.mock.calls.map((call) => call[4])).toEqual([
      '"activity-alpha-r1"',
      '"activity-alpha-r1"',
    ]);
    expect(api.getActivity).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved translation');
    expect(screen.getByLabelText('Default capacity')).toHaveValue(8);
  });

  it('preserves the draft when explicit reload fails', async () => {
    const api = createApi();
    renderSlotCatalog(api);
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Unsaved name' },
    });
    api.getActivity.mockRejectedValue(
      new DashboardApiError(503, 'unknown', {
        code: 'temporarily_unavailable',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload current activity' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved name');
  });

  it('does not open an empty editor or load slots after a failed activity preload', async () => {
    const api = createApi();
    api.getActivity.mockRejectedValue(
      new DashboardApiError(404, 'unknown', { code: 'resource_not_found' }),
    );
    renderSlotCatalog(api);
    await screen.findByText('Activity could not be loaded');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save translation' }),
    ).not.toBeInTheDocument();
    expect(api.listActivities).not.toHaveBeenCalled();
    expect(api.listSlots).not.toHaveBeenCalled();
  });

  it('closes slots from the activity editor through the existing command', async () => {
    const api = createApi();
    renderSlotCatalog(api);
    const time = await screen.findByText('Oct 1, 2026, 12:00 UTC+02:00');
    expect(time).toHaveAttribute('datetime', '2026-10-01T10:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(api.closeSlot).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'slot-alpha',
      ),
    );
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/dashboard');
  });

  it('loads a deep-linked activity directly without depending on list pagination', async () => {
    const api = createApi();
    let releaseActivities = () => {};
    api.getActivity.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseActivities = () =>
            resolve({
              activity: {
                id: 'activity-beta',
                status: 'Draft',
                baseLocale: 'es',
                name: { es: 'activity-beta' },
                createdAt: '2026-09-27T10:00:00Z',
              },
              etag: '"activity-beta-r1"',
            });
        }),
    );
    window.history.replaceState(
      null,
      '',
      '/dashboard?center=center-alpha&activity=activity-beta&slotPage=3',
    );
    renderCatalog(api, vi.fn(), 'Europe/Madrid', {
      kind: 'edit',
      activityId: 'activity-beta',
    });
    await screen.findByText('Loading activity');
    expect(new URLSearchParams(window.location.search).get('activity')).toBe(
      'activity-beta',
    );
    expect(new URLSearchParams(window.location.search).get('slotPage')).toBe(
      '3',
    );
    expect(api.listSlots).not.toHaveBeenCalled();
    expect(api.listActivities).not.toHaveBeenCalled();
    releaseActivities();
    await screen.findByText('Slots for activity-beta');
    await waitFor(() =>
      expect(api.listSlots).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-beta',
        { page: 3, pageSize: 10 },
        expect.any(AbortSignal),
      ),
    );
  });

  it('normalizes an unauthorized center without querying its deep-linked slots', async () => {
    const api = createApi();
    window.history.replaceState(
      null,
      '',
      '/dashboard?center=center-foreign&activity=activity-foreign&activityPage=4&slotPage=3',
    );
    renderCatalog(api, vi.fn(), 'Europe/Madrid', { kind: 'list' });
    await screen.findByText('Buceo nocturno');
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('center')).toBe('center-alpha');
      expect(params.has('activity')).toBe(false);
      expect(params.has('activityPage')).toBe(false);
      expect(params.has('slotPage')).toBe(false);
      expect(api.listSlots).not.toHaveBeenCalled();
    });
    for (const call of api.listSlots.mock.calls) {
      expect(call.slice(0, 3)).toEqual([
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
      ]);
      expect(call[3]).toEqual({ page: 1, pageSize: 10 });
    }
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
    renderCatalog(api, vi.fn(), 'Europe/Madrid', { kind: 'list' });
    await screen.findByText('Diving');
    expect(screen.getByText('Descripcion base')).toBeInTheDocument();
    expect(screen.queryByText('Not a third fallback')).not.toBeInTheDocument();
    expect(screen.queryByText('Buceo')).not.toBeInTheDocument();
    expect(items).toEqual(before);
    expect(api.createActivity).not.toHaveBeenCalled();
  });

  it('loads the selected authorized center and its activity-scoped slots', async () => {
    const api = createApi();
    renderSlotCatalog(api);
    expect(
      await screen.findByText('Slots for Buceo nocturno'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getActivity).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
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

    await screen.findByText('Catalog language: Spanish');
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
    expect(screen.getByLabelText('Name · ES')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: 'center-beta' },
    });
    await screen.findByText('Catalog language: Spanish');
    expect(screen.queryByText('Activity created.')).not.toBeInTheDocument();
  });

  it('validates activity drafts before sending commands', async () => {
    const api = createApi();
    renderCatalog(api);

    await screen.findByText('Catalog language: Spanish');
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    expect(
      await screen.findByText('Add the activity name in Spanish.'),
    ).toBeInTheDocument();
    expect(api.createActivity).not.toHaveBeenCalled();
  });

  it.each(['Duration · minutes', 'Capacity'])(
    'rejects an empty required slot field: %s (DIVE-BOOK-REQ-052)',
    async (label) => {
      const api = createApi();
      renderSlotCatalog(api);
      await screen.findByText('Slots for Buceo nocturno');
      fireEvent.change(screen.getByLabelText('Start date and time'), {
        target: { value: '2026-10-01T10:00' },
      });
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create slot' }));
      expect(
        await screen.findByText(
          'Duration and capacity must be positive whole numbers.',
        ),
      ).toBeInTheDocument();
      expect(api.createSlot).not.toHaveBeenCalled();
    },
  );

  it.each(['0', '-1', '1.5', '9007199254740992'])(
    'rejects an invalid slot integer: %s (DIVE-BOOK-REQ-052)',
    async (value) => {
      const api = createApi();
      renderSlotCatalog(api);
      await screen.findByText('Slots for Buceo nocturno');
      fireEvent.change(screen.getByLabelText('Start date and time'), {
        target: { value: '2026-10-01T10:00' },
      });
      fireEvent.change(screen.getByLabelText('Duration · minutes'), {
        target: { value },
      });
      fireEvent.change(screen.getByLabelText('Capacity'), {
        target: { value },
      });
      const slotForm = screen
        .getByRole('button', { name: 'Create slot' })
        .closest('form');
      if (!slotForm) throw new Error('Slot form not found.');
      fireEvent.submit(slotForm);
      expect(await screen.findAllByRole('alert')).toHaveLength(2);
      expect(api.createSlot).not.toHaveBeenCalled();
    },
  );

  it('leaves the editor when changing center instead of reusing its activity', async () => {
    const api = createApi();
    renderSlotCatalog(api);
    await screen.findByText('Slots for Buceo nocturno');
    fireEvent.change(screen.getByLabelText('Start date and time'), {
      target: { value: '2026-10-01T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Capacity'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: 'center-beta' },
    });
    await screen.findByText('Buceo nocturno');
    expect(window.location.pathname).toBe('/dashboard/activities');
    expect(
      screen.queryByLabelText('Start date and time'),
    ).not.toBeInTheDocument();
    expect(api.createSlot).not.toHaveBeenCalled();
  });

  it('preserves an activity draft after a failed creation', async () => {
    const api = createApi();
    api.createActivity.mockRejectedValue(
      new DashboardApiError(422, 'unknown', {
        code: 'validation_error',
      }),
    );
    renderCatalog(api);
    await screen.findByText('Catalog language: Spanish');
    fireEvent.change(screen.getByLabelText('Name · ES'), {
      target: { value: 'Curso de apnea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    await screen.findByText('validation_error');
    expect(screen.getByLabelText('Name · ES')).toHaveValue('Curso de apnea');
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
    renderCatalog(api, vi.fn(), 'Europe/Madrid', { kind: 'list' });

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
    window.history.replaceState(
      null,
      '',
      '/dashboard?center=center-alpha&activity=activity-linked&slotPage=3',
    );
    vi.mocked(api.listActivities).mockRejectedValue(
      new DashboardApiError(404, 'unknown', {
        code: 'resource_not_found',
        detail: 'activity belongs to another center',
      }),
    );
    renderCatalog(api, vi.fn(), 'Europe/Madrid', { kind: 'list' });

    expect(
      await screen.findByText('Activities could not be loaded'),
    ).toBeInTheDocument();
    expect(screen.getByText('resource_not_found')).toBeInTheDocument();
    expect(
      screen.queryByText('activity belongs to another center'),
    ).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('activity')).toBe(
      'activity-linked',
    );
    expect(new URLSearchParams(window.location.search).get('slotPage')).toBe(
      '3',
    );
    expect(api.listSlots).not.toHaveBeenCalled();
  });

  it('delegates an expired catalog session to the dashboard context', async () => {
    const api = createApi();
    const handleSessionExpired = vi.fn();
    api.getCatalogSettings.mockRejectedValue(
      new DashboardApiError(401, 'session-expired'),
    );
    vi.mocked(api.listActivities).mockRejectedValue(
      new DashboardApiError(401, 'session-expired'),
    );
    renderCatalog(api, handleSessionExpired);

    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalledOnce());
  });

  it('handles mutation session expiry in the mutation callback', async () => {
    const api = createApi();
    const handleSessionExpired = vi.fn();
    api.publishActivity.mockRejectedValue(
      new DashboardApiError(401, 'session-expired'),
    );
    renderCatalog(api, handleSessionExpired, 'Europe/Madrid', { kind: 'list' });
    await screen.findByText('Buceo nocturno');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalledOnce());
  });

  it('publishes activities from the list through typed commands', async () => {
    const api = createApi();
    renderCatalog(api, vi.fn(), 'Europe/Madrid', { kind: 'list' });

    await screen.findByText('Buceo nocturno');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(api.publishActivity).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
      );
    });
  });

  it('creates a slot by converting the entered center-local time to an instant', async () => {
    const api = createApi();
    renderSlotCatalog(api);

    await screen.findByText('Slots for Buceo nocturno');
    fireEvent.change(screen.getByLabelText('Start date and time'), {
      target: { value: '2026-10-01T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create slot' }));

    await waitFor(() => {
      expect(api.createSlot).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        {
          startsAt: '2026-10-01T08:00:00Z',
          durationMinutes: 60,
          capacity: 8,
        },
      );
    });
    await screen.findByText('Slot created.');
    expect(screen.getByLabelText('Start date and time')).toHaveValue('');
  });

  it('uses the authorized center zone for both presentation and creation', async () => {
    const api = createApi();
    renderSlotCatalog(api, vi.fn(), 'Atlantic/Canary');
    await screen.findByText('Oct 1, 2026, 11:00 UTC+01:00');
    expect(screen.getByText('Atlantic/Canary')).toBeInTheDocument();
    expect(screen.queryByText('2026-10-01T10:00:00Z')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start date and time'), {
      target: { value: '2026-10-01T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create slot' }));
    await waitFor(() => {
      expect(api.createSlot).toHaveBeenCalledWith(
        'ctx_alpha',
        'center-alpha',
        'activity-alpha',
        { startsAt: '2026-10-01T09:00:00Z', durationMinutes: 60, capacity: 8 },
      );
    });
  });

  it('informs and blocks local slot input when the center zone is missing', async () => {
    const api = createApi();
    renderSlotCatalog(api, vi.fn(), null);
    await screen.findByText('Center time zone is not configured');
    expect(screen.getByLabelText('Start date and time')).toBeDisabled();
    expect(screen.getByLabelText('Duration · minutes')).toBeDisabled();
    expect(screen.getByLabelText('Capacity')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create slot' })).toBeDisabled();
    expect(
      await screen.findByText('Start time unavailable'),
    ).toBeInTheDocument();
    const form = screen
      .getByRole('button', { name: 'Create slot' })
      .closest('form');
    if (!form) throw new Error('Slot form not found.');
    fireEvent.submit(form);
    expect(api.createSlot).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
  });

  it.each(['2026-03-29T02:30', '2026-10-25T02:30'])(
    'rejects DST local time %s without losing the draft',
    async (startsAt) => {
      const api = createApi();
      renderSlotCatalog(api);
      await screen.findByText('Slots for Buceo nocturno');
      const input = screen.getByLabelText('Start date and time');
      fireEvent.change(input, { target: { value: startsAt } });
      fireEvent.click(screen.getByRole('button', { name: 'Create slot' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'unambiguous time',
      );
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveValue(startsAt);
      expect(api.createSlot).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: '2026-10-01T10:00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create slot' }));
      await waitFor(() => expect(api.createSlot).toHaveBeenCalledOnce());
    },
  );
});
