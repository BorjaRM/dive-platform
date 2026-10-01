import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardCalendar } from './dashboard-calendar';
import { DashboardContextProvider } from './dashboard-context';
import { type DashboardApi, DashboardApiError } from './tenant-context';

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/dashboard',
    useRouter: () => ({
      replace: (href: string) => {
        window.history.replaceState(null, '', href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      },
    }),
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          (onChange) => {
            window.addEventListener('popstate', onChange);
            return () => window.removeEventListener('popstate', onChange);
          },
          () => window.location.search,
          () => '',
        ),
      ),
  };
});

function createApi() {
  return {
    getDashboardCapabilities: vi.fn().mockResolvedValue({
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: true,
      canScheduleSession: true,
    }),
    listActivities: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'activity-a',
          name: { es: 'Buceo' },
          baseLocale: 'es',
          status: 'Published',
          createdAt: '2026-09-01T00:00:00Z',
        },
      ],
      page: 1,
      pageSize: 50,
      hasNext: false,
    }),
    listCalendarSlots: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'slot-a',
          activityId: 'activity-a',
          startsAt: '2026-10-01T10:00:00Z',
          durationMinutes: 60,
          capacity: 8,
          status: 'Available',
          createdAt: '2026-09-01T00:00:00Z',
          activity: { name: { es: 'Buceo' }, baseLocale: 'es' },
          confirmedSeats: 2,
          heldSeats: 1,
          remainingSeats: null,
        },
      ],
      page: 1,
      pageSize: 50,
      hasNext: false,
      asOf: '2026-10-01T09:00:00.000001Z',
    }),
    listSlotBookings: vi
      .fn()
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, hasNext: false }),
    getBookingContact: vi.fn(),
    closeSlot: vi.fn().mockResolvedValue(undefined),
    cancelSlot: vi.fn().mockResolvedValue(undefined),
  };
}

function renderCalendar(
  api: ReturnType<typeof createApi>,
  timeZone: string | null = 'Europe/Madrid',
  handleSessionExpired = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
            { id: 'center-a', name: 'Center A', timeZone },
            { id: 'center-b', name: 'Center B', timeZone },
          ],
          sessionState: 'available',
          isReady: true,
          invalidateDashboardCache: vi.fn(),
          handleSessionExpired,
          clearTenantContext: vi.fn(),
        }}
      >
        <DashboardCalendar />
      </DashboardContextProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe('main dashboard calendar (DIVE-BOOK-REQ-043 fixed-time phase)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'));
    window.history.replaceState(null, '', '/dashboard');
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('opens the current week, renders center-local times and supports month, day and agenda', async () => {
    const api = createApi();
    const { container, queryClient } = renderCalendar(api);
    const view = await screen.findByLabelText('View');
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    expect(view).toHaveValue('timeGridWeek');
    expect(container.querySelector('.fc-event')).toHaveTextContent('12:00');
    expect(api.listCalendarSlots).toHaveBeenCalledWith(
      'ctx-private',
      'center-a',
      {
        page: 1,
        pageSize: 50,
        from: '2026-09-27T22:00:00.000Z',
        to: '2026-10-04T22:00:00.000Z',
      },
      expect.any(AbortSignal),
    );
    for (const [value, selector] of [
      ['dayGridMonth', '.fc-dayGridMonth-view'],
      ['timeGridDay', '.fc-timeGridDay-view'],
      ['listWeek', '.fc-listWeek-view'],
    ] as const) {
      fireEvent.change(view, { target: { value } });
      await waitFor(() =>
        expect(container.querySelector(selector)).not.toBeNull(),
      );
    }
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
      ),
    ).not.toContain('ctx-private');
    expect(
      screen.getByRole('link', { name: 'Manage activities' }),
    ).toHaveAttribute('href', '/dashboard/activities?center=center-a');
  });

  it('navigates periods and does not retain events while the new interval loads', async () => {
    const api = createApi();
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    api.listCalendarSlots.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    await waitFor(() =>
      expect(api.listCalendarSlots).toHaveBeenLastCalledWith(
        'ctx-private',
        'center-a',
        expect.objectContaining({
          from: '2026-10-04T22:00:00.000Z',
          to: '2026-10-11T22:00:00.000Z',
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(container.querySelector('.fc-event')).toBeNull();
  });

  it('uses only listed activities and authorized centers, and scopes status filters', async () => {
    const api = createApi();
    window.history.replaceState(
      null,
      '',
      '/dashboard?center=foreign&activity=foreign',
    );
    renderCalendar(api);
    await waitFor(() => expect(api.listCalendarSlots).toHaveBeenCalled());
    expect(screen.getByLabelText('Center')).toHaveValue('center-a');
    expect(screen.getByLabelText('Activity')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'Full' },
    });
    await waitFor(() =>
      expect(api.listCalendarSlots).toHaveBeenLastCalledWith(
        'ctx-private',
        'center-a',
        expect.objectContaining({ slotStatus: 'Full' }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: 'center-b' },
    });
    await waitFor(() =>
      expect(api.listCalendarSlots).toHaveBeenLastCalledWith(
        'ctx-private',
        'center-b',
        expect.any(Object),
        expect.any(AbortSignal),
      ),
    );
    expect(
      api.listCalendarSlots.mock.calls.every(
        (call) => call[1] !== 'foreign' && call[2] !== 'foreign',
      ),
    ).toBe(true);
  });

  it('opens slot details and reuses scoped close/cancel commands', async () => {
    const api = createApi();
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    fireEvent.click(container.querySelector('.fc-event') as HTMLElement);
    expect(screen.getByText('60 min · capacity 8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await screen.findByText('Slot closed.');
    expect(api.closeSlot).toHaveBeenCalledWith(
      'ctx-private',
      'center-a',
      'slot-a',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByText('Slot cancelled.');
    expect(api.cancelSlot).toHaveBeenCalledWith(
      'ctx-private',
      'center-a',
      'slot-a',
    );
  });

  it.each([null, 'Invalid/Zone'])(
    'does not render or query a calendar without a valid center zone: %s',
    async (timeZone) => {
      const api = createApi();
      renderCalendar(api, timeZone);
      expect(
        screen.getByText('Center time zone is not configured'),
      ).toBeInTheDocument();
      expect(api.listActivities).not.toHaveBeenCalled();
      expect(api.listCalendarSlots).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('View')).not.toBeInTheDocument();
    },
  );

  it('reports empty ranges and failed loads without displaying a partial schedule', async () => {
    const api = createApi();
    api.listCalendarSlots.mockResolvedValueOnce({
      items: [],
      page: 1,
      pageSize: 50,
      hasNext: false,
      asOf: '2026-10-01T09:00:00.000001Z',
    });
    const { container } = renderCalendar(api);
    await screen.findByText('No scheduled activities in this period');
    api.listCalendarSlots.mockRejectedValue(new Error('Unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    await screen.findByText('Calendar could not be loaded');
    expect(container.querySelector('.fc-event')).toBeNull();
  });

  it('reports an unrepresentable slot end as a load error', async () => {
    const api = createApi();
    api.listCalendarSlots.mockResolvedValue({
      items: [
        {
          id: 'slot-a',
          activityId: 'activity-a',
          startsAt: '2026-10-01T10:00:00Z',
          durationMinutes: Number.MAX_SAFE_INTEGER,
          capacity: 8,
          status: 'Available',
          createdAt: '2026-09-01T00:00:00Z',
        },
      ],
      page: 1,
      pageSize: 50,
      hasNext: false,
      asOf: '2026-10-01T09:00:00.000001Z',
    });
    const { container } = renderCalendar(api);
    await screen.findByText('Calendar could not be loaded');
    expect(container.querySelector('.fc-event')).toBeNull();
  });

  it('reports session expiry through the existing session owner', async () => {
    const api = createApi();
    const handleSessionExpired = vi.fn();
    api.listCalendarSlots.mockRejectedValue(
      new DashboardApiError(401, 'session-expired'),
    );
    renderCalendar(api, 'Europe/Madrid', handleSessionExpired);
    await waitFor(() => expect(handleSessionExpired).toHaveBeenCalled());
  });

  it('opens recovered URL navigation and keeps a valid inaccessible activity non-disclosing', async () => {
    const api = createApi();
    const selected = 'aaaaaaaa-0001-4001-8001-000000000099';
    window.history.replaceState(
      null,
      '',
      `/dashboard?calendarView=listWeek&calendarDate=2026-10-01&activity=${selected}&slotStatus=Closed&unrelated=retained`,
    );
    api.listCalendarSlots.mockRejectedValue(
      new DashboardApiError(404, 'unknown', { code: 'resource_not_found' }),
    );
    const { container } = renderCalendar(api);
    await screen.findByText('Calendar could not be loaded');
    expect(screen.getByLabelText('View')).toHaveValue('listWeek');
    expect(screen.getByLabelText('Activity')).toHaveValue(selected);
    expect(container.querySelector('.fc-event')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('activity')).toBe(
      selected,
    );
    expect(new URLSearchParams(window.location.search).get('unrelated')).toBe(
      'retained',
    );
    expect(
      api.listCalendarSlots.mock.calls.every(
        (call) =>
          call[2].activityId === selected && call[2].slotStatus === 'Closed',
      ),
    ).toBe(true);
  });

  it('updates navigation in the URL and follows restored navigation without stale events', async () => {
    const api = createApi();
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    fireEvent.change(screen.getByLabelText('View'), {
      target: { value: 'timeGridDay' },
    });
    await waitFor(() =>
      expect(
        new URLSearchParams(window.location.search).get('calendarView'),
      ).toBe('timeGridDay'),
    );
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/dashboard?calendarView=timeGridWeek&calendarDate=2026-10-15',
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() =>
      expect(api.listCalendarSlots).toHaveBeenLastCalledWith(
        'ctx-private',
        'center-a',
        expect.objectContaining({
          from: '2026-10-11T22:00:00.000Z',
          to: '2026-10-18T22:00:00.000Z',
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByLabelText('View')).toHaveValue('timeGridWeek');
  });

  it('refreshes on explicit action and regained focus without automatic write retries', async () => {
    const api = createApi();
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    const beforeRefresh = api.listCalendarSlots.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(api.listCalendarSlots.mock.calls.length).toBeGreaterThan(
        beforeRefresh,
      ),
    );
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    const beforeFocus = api.listCalendarSlots.mock.calls.length;
    fireEvent.focus(window);
    await waitFor(() =>
      expect(api.listCalendarSlots.mock.calls.length).toBeGreaterThan(
        beforeFocus,
      ),
    );
    expect(api.closeSlot).not.toHaveBeenCalled();
    expect(api.cancelSlot).not.toHaveBeenCalled();
  });

  it('keeps read-only detail free of closing and cancellation controls', async () => {
    const api = createApi();
    api.getDashboardCapabilities.mockResolvedValue({
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: false,
      canScheduleSession: false,
    });
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    fireEvent.click(container.querySelector('.fc-event') as HTMLElement);
    await screen.findByText('Bookings');
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(api.closeSlot).not.toHaveBeenCalled();
    expect(api.cancelSlot).not.toHaveBeenCalled();
  });

  const booking = {
    bookingId: 'booking-a',
    status: 'Pending',
    seats: 3,
    bookingChannel: 'public_hosted',
    createdAt: '2026-09-01T10:00:00Z',
    holdExpiresAt: '2000-01-01T00:00:00Z',
  };
  const contact = {
    bookingId: 'booking-a',
    booker: {
      firstName: 'Private',
      lastName: 'Contact',
      email: 'private-contact@example.test',
      phone: null,
    },
  };

  it('reads contact only on explicit opening, without caching or storing personal fields', async () => {
    const api = createApi();
    api.listSlotBookings.mockResolvedValue({
      items: [booking],
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    api.getBookingContact.mockResolvedValue(contact);
    const { container, queryClient } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    expect(api.listSlotBookings).not.toHaveBeenCalled();
    expect(container.querySelector('.fc-event')).toHaveTextContent(
      '2 confirmed',
    );
    expect(container.querySelector('.fc-event')).toHaveTextContent('1 held');
    expect(container.querySelector('.fc-event')).toHaveTextContent(
      'Remaining unavailable',
    );
    fireEvent.click(container.querySelector('.fc-event') as HTMLElement);
    const trigger = await screen.findByRole('button', {
      name: 'View contact for booking booking-a',
    });
    expect(
      within(screen.getByRole('list')).getByText('Pending'),
    ).toBeInTheDocument();
    expect(api.getBookingContact).not.toHaveBeenCalled();
    expect(screen.queryByText(contact.booker.email)).not.toBeInTheDocument();
    fireEvent.click(trigger);
    await screen.findByText(contact.booker.email);
    expect(api.getBookingContact).toHaveBeenCalledWith(
      'ctx-private',
      'center-a',
      'booking-a',
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('heading', { name: 'Booking contact' }),
    ).toHaveFocus();
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain(contact.booker.email);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(
      contact.booker.email,
    );
    expect(JSON.stringify(window.localStorage)).not.toContain(
      contact.booker.email,
    );
    expect(window.location.search).not.toContain('private-contact');
    fireEvent.click(screen.getByRole('button', { name: 'Hide contact' }));
    expect(screen.queryByText(contact.booker.email)).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps booking filters/pages local, discards contacts and does not recalculate occupancy', async () => {
    const api = createApi();
    api.listSlotBookings.mockResolvedValue({
      items: [booking],
      page: 1,
      pageSize: 20,
      hasNext: true,
    });
    api.getBookingContact.mockResolvedValue(contact);
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    fireEvent.click(container.querySelector('.fc-event') as HTMLElement);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View contact for booking booking-a',
      }),
    );
    await screen.findByText(contact.booker.email);
    fireEvent.click(screen.getByRole('button', { name: 'Next bookings' }));
    await waitFor(() =>
      expect(api.listSlotBookings).toHaveBeenLastCalledWith(
        'ctx-private',
        'center-a',
        'slot-a',
        { page: 2, pageSize: 20 },
        expect.any(AbortSignal),
      ),
    );
    expect(screen.queryByText(contact.booker.email)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Booking status'), {
      target: { value: 'Confirmed' },
    });
    await waitFor(() =>
      expect(api.listSlotBookings).toHaveBeenLastCalledWith(
        'ctx-private',
        'center-a',
        'slot-a',
        { page: 1, pageSize: 20, bookingStatus: 'Confirmed' },
        expect.any(AbortSignal),
      ),
    );
    expect(api.getBookingContact).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.fc-event')).toHaveTextContent(
      '2 confirmed',
    );
    expect(
      new URLSearchParams(window.location.search).has('bookingStatus'),
    ).toBe(false);
  });

  it.each(['manual', 'focus'])(
    'preserves booking filters and pages during a %s refresh without stale detail',
    async (trigger) => {
      const api = createApi();
      api.listSlotBookings.mockResolvedValue({
        items: [booking],
        page: 1,
        pageSize: 20,
        hasNext: true,
      });
      api.getBookingContact.mockResolvedValue(contact);
      const { container } = renderCalendar(api);
      await waitFor(() =>
        expect(container.querySelector('.fc-event')).not.toBeNull(),
      );
      fireEvent.click(container.querySelector('.fc-event') as HTMLElement);
      fireEvent.change(await screen.findByLabelText('Booking status'), {
        target: { value: 'Pending' },
      });
      fireEvent.click(
        await screen.findByRole('button', { name: 'Next bookings' }),
      );
      await screen.findByText('Page 2');
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'View contact for booking booking-a',
        }),
      );
      await screen.findByText(contact.booker.email);
      const refreshedPage = await api.listCalendarSlots.mock.results[0]?.value;
      let completeRefresh: (value: typeof refreshedPage) => void = () =>
        undefined;
      api.listCalendarSlots.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeRefresh = resolve;
          }),
      );
      if (trigger === 'manual')
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      else fireEvent.focus(window);
      await screen.findByText('Loading scheduled activities');
      expect(screen.queryByText('60 min · capacity 8')).not.toBeInTheDocument();
      expect(screen.queryByText(contact.booker.email)).not.toBeInTheDocument();
      await act(async () => completeRefresh(refreshedPage));
      expect(await screen.findByLabelText('Booking status')).toHaveValue(
        'Pending',
      );
      await screen.findByText('Page 2');
      expect(api.listSlotBookings).toHaveBeenLastCalledWith(
        'ctx-private',
        'center-a',
        'slot-a',
        { page: 2, pageSize: 20, bookingStatus: 'Pending' },
        expect.any(AbortSignal),
      );
      expect(screen.queryByText(contact.booker.email)).not.toBeInTheDocument();
    },
  );

  it('cancels contact reads on center changes and never reveals late responses', async () => {
    const api = createApi();
    api.listSlotBookings.mockResolvedValue({
      items: [booking],
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    let resolveContact: (value: typeof contact) => void = () => undefined;
    let pendingSignal: AbortSignal | undefined;
    api.getBookingContact.mockImplementation(
      (_context, _center, _booking, signal: AbortSignal) => {
        pendingSignal = signal;
        return new Promise((resolve) => {
          resolveContact = resolve;
        });
      },
    );
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    fireEvent.click(container.querySelector('.fc-event') as HTMLElement);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View contact for booking booking-a',
      }),
    );
    await screen.findByText('Loading contact');
    fireEvent.change(screen.getByLabelText('Center'), {
      target: { value: 'center-b' },
    });
    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
    await act(async () => {
      resolveContact(contact);
    });
    expect(screen.queryByText(contact.booker.email)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Booking contact' }),
    ).not.toBeInTheDocument();
  });

  it('reports contact denial without revealing the previous booking contact', async () => {
    const api = createApi();
    api.listSlotBookings.mockResolvedValue({
      items: [booking, { ...booking, bookingId: 'booking-b' }],
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    api.getBookingContact
      .mockResolvedValueOnce(contact)
      .mockRejectedValueOnce(new DashboardApiError(403, 'forbidden'));
    const { container } = renderCalendar(api);
    await waitFor(() =>
      expect(container.querySelector('.fc-event')).not.toBeNull(),
    );
    fireEvent.click(container.querySelector('.fc-event') as HTMLElement);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View contact for booking booking-a',
      }),
    );
    await screen.findByText(contact.booker.email);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'View contact for booking booking-b',
      }),
    );
    await screen.findByText('Contact could not be loaded');
    expect(screen.queryByText(contact.booker.email)).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'Booking contact' }),
      ).queryByText('Private Contact'),
    ).not.toBeInTheDocument();
  });
});
