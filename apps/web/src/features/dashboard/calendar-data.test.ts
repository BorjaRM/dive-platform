import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calendarSlotEnd,
  loadCalendarActivities,
  loadCalendarSlots,
  loadUpcomingSlots,
} from './calendar-data';
import { resolveCalendarNavigation } from './calendar-navigation';
import type { CatalogSlot } from './catalog-api';
import { createDashboardApi, type DashboardApi } from './tenant-context';

const slot = {
  id: 'slot-a',
  activityId: 'activity-a',
  startsAt: '2026-10-01T12:00:00+02:00',
  durationMinutes: 90,
  capacity: 8,
  status: 'Available',
  createdAt: '2026-09-01T00:00:00Z',
  activity: { name: { en: 'Dive' }, baseLocale: 'en' as const },
  confirmedSeats: 2,
  heldSeats: 1,
  remainingSeats: null,
} satisfies CatalogSlot & Record<string, unknown>;
const asOf = '2026-10-01T09:00:00.000001Z';

afterEach(() => vi.unstubAllGlobals());

describe('calendar URL recovery (DIVE-BOOK-REQ-043)', () => {
  const activity = 'aaaaaaaa-0001-4001-8001-000000000001';
  const now = '2026-09-30T23:00:00Z';
  it('defaults to the current center-local week and preserves unrelated keys', () => {
    const result = resolveCalendarNavigation(
      'center=authorized&other=retained',
      'Europe/Madrid',
      now,
    );
    expect(result).toMatchObject({ view: 'timeGridWeek', date: '2026-10-01' });
    expect(new URLSearchParams(result?.canonical).get('other')).toBe(
      'retained',
    );
  });
  it.each([
    'calendarView=invalid',
    'calendarDate=2026-02-30',
    'calendarDate=2026-01-01&calendarDate=2026-02-01',
    'calendarView=listWeek&calendarView=timeGridDay',
    'calendarDate=',
    'calendarDate=2026-13-01',
  ])(
    'recovers both navigation values and retains valid filters: %s',
    (input) => {
      expect(
        resolveCalendarNavigation(
          `${input}&activity=${activity}&slotStatus=Closed`,
          'Europe/Madrid',
          now,
        ),
      ).toMatchObject({
        view: 'timeGridWeek',
        date: '2026-10-01',
        activityId: activity,
        slotStatus: 'Closed',
      });
    },
  );
  it('retains a syntactically valid activity without inferring resource access', () => {
    expect(
      resolveCalendarNavigation(
        `calendarView=listWeek&calendarDate=2028-02-29&activity=${activity}&slotStatus=Full`,
        'Europe/Madrid',
        now,
      ),
    ).toMatchObject({
      view: 'listWeek',
      date: '2028-02-29',
      activityId: activity,
      slotStatus: 'Full',
    });
  });
  it.each([
    'activity=invalid&slotStatus=Pending',
    `activity=${activity}&activity=${activity}&slotStatus=Full&slotStatus=Full`,
  ])('removes only invalid or repeated filters: %s', (filters) => {
    const result = resolveCalendarNavigation(
      `calendarView=timeGridDay&calendarDate=2026-09-15&${filters}`,
      'Europe/Madrid',
      now,
    );
    expect(result).toMatchObject({
      view: 'timeGridDay',
      date: '2026-09-15',
      activityId: null,
      slotStatus: '',
    });
    expect(result?.canonical).not.toContain('activity=');
    expect(result?.canonical).not.toContain('slotStatus=');
  });
  it.each([null, 'Invalid/Zone'])(
    'does not normalize navigation before the center time zone is available: %s',
    (zone) => {
      expect(resolveCalendarNavigation('', zone, now)).toBeNull();
    },
  );
});

describe('calendar fixed-time data (DIVE-BOOK-REQ-043, 049)', () => {
  it('uses one center-level request for the server-ordered next five sessions', async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      ...slot,
      id: `slot-${index}`,
      startsAt: `2030-10-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    }));
    const listUpcomingSlots = vi.fn().mockResolvedValue({
      items,
      page: 1,
      pageSize: 5,
      hasNext: true,
    });
    const signal = new AbortController().signal;
    const from = '2026-10-01T09:00:00.000Z';
    const result = await loadUpcomingSlots(
      { listUpcomingSlots } as unknown as DashboardApi,
      'ctx',
      'center-a',
      from,
      signal,
    );
    expect(result).toEqual(items);
    expect(listUpcomingSlots).toHaveBeenCalledOnce();
    expect(listUpcomingSlots).toHaveBeenCalledWith(
      'ctx',
      'center-a',
      { from },
      signal,
    );
  });

  it('does not expose an upcoming list when the center request fails', async () => {
    const listUpcomingSlots = vi
      .fn()
      .mockRejectedValue(new Error('Unavailable'));
    await expect(
      loadUpcomingSlots(
        { listUpcomingSlots } as unknown as DashboardApi,
        'ctx',
        'center-a',
        '2026-10-01T00:00:00Z',
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unavailable');
  });

  it('preserves the server order and all internal statuses when fewer than five are available', async () => {
    const earlier = {
      ...slot,
      id: 'earlier',
      startsAt: '2026-10-01T12:00:00+02:00',
      status: 'Closed' as const,
    };
    const later = {
      ...slot,
      id: 'later',
      startsAt: '2026-10-01T09:00:00-02:00',
      status: 'Cancelled' as const,
    };
    const listUpcomingSlots = vi.fn().mockResolvedValue({
      items: [earlier, later],
      page: 1,
      pageSize: 5,
      hasNext: false,
    });
    const result = await loadUpcomingSlots(
      { listUpcomingSlots } as unknown as DashboardApi,
      'ctx',
      'center-a',
      '2026-10-01T08:00:00Z',
      new AbortController().signal,
    );
    expect(result).toEqual([earlier, later]);
  });

  it('discards an upcoming response after cancellation', async () => {
    const controller = new AbortController();
    const listUpcomingSlots = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { items: [slot], page: 1, pageSize: 5, hasNext: false };
    });
    await expect(
      loadUpcomingSlots(
        { listUpcomingSlots } as unknown as DashboardApi,
        'ctx',
        'center-a',
        '2026-10-01T00:00:00Z',
        controller.signal,
      ),
    ).rejects.toThrow();
  });

  it('loads every activity page through the scoped API', async () => {
    const listActivities = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], hasNext: true })
      .mockResolvedValueOnce({ items: [{ id: 'b' }], hasNext: false });
    const signal = new AbortController().signal;
    const result = await loadCalendarActivities(
      { listActivities } as unknown as DashboardApi,
      'ctx',
      'center-a',
      signal,
    );
    expect(result.map((activity) => activity.id)).toEqual(['a', 'b']);
    expect(listActivities).toHaveBeenLastCalledWith(
      'ctx',
      'center-a',
      { page: 2, pageSize: 50 },
      signal,
    );
  });

  it('loads every aggregate range page and retains each page observation', async () => {
    const listCalendarSlots = vi
      .fn()
      .mockResolvedValueOnce({ items: [slot], hasNext: true, asOf })
      .mockResolvedValueOnce({
        items: [slot, { ...slot, id: 'slot-b' }],
        hasNext: false,
        asOf: '2026-10-01T09:00:01.000002Z',
      });
    const signal = new AbortController().signal;
    const range = { from: '2026-09-28T00:00:00Z', to: '2026-10-05T00:00:00Z' };
    const result = await loadCalendarSlots(
      { listCalendarSlots } as unknown as DashboardApi,
      'ctx',
      'center-a',
      'activity-a',
      range,
      'Available',
      signal,
    );
    expect(result.map((item) => item.id)).toEqual(['slot-a', 'slot-b']);
    expect(result[0]?.asOf).toBe('2026-10-01T09:00:01.000002Z');
    expect(listCalendarSlots).toHaveBeenLastCalledWith(
      'ctx',
      'center-a',
      {
        page: 2,
        pageSize: 50,
        ...range,
        activityId: 'activity-a',
        slotStatus: 'Available',
      },
      signal,
    );
  });

  it('does not continue fetching when a scope or range request is aborted', async () => {
    const controller = new AbortController();
    const listCalendarSlots = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { items: [slot], hasNext: true };
    });
    await expect(
      loadCalendarSlots(
        { listCalendarSlots } as unknown as DashboardApi,
        'ctx',
        'center-a',
        null,
        { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' },
        '',
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(listCalendarSlots).toHaveBeenCalledTimes(1);
  });

  it('rejects a partial range when a later page fails', async () => {
    const listCalendarSlots = vi
      .fn()
      .mockResolvedValueOnce({ items: [slot], hasNext: true, asOf })
      .mockRejectedValueOnce(new Error('Unavailable'));
    await expect(
      loadCalendarSlots(
        { listCalendarSlots } as unknown as DashboardApi,
        'ctx',
        'center-a',
        null,
        { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' },
        '',
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unavailable');
  });

  it('derives the end from the committed instant and duration', () => {
    expect(calendarSlotEnd(slot)).toBe('2026-10-01T11:30:00.000Z');
  });

  it('uses the existing no-store transport for aggregate, booking and explicit contact reads', async () => {
    const upstream = vi
      .fn()
      .mockImplementation(async () => Response.json({ items: [], asOf }));
    vi.stubGlobal('fetch', upstream);
    const api = createDashboardApi({
      session: { getToken: async () => 'token' },
    });
    const signal = new AbortController().signal;
    await api.listCalendarSlots(
      'ctx',
      'center-a',
      {
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-02T00:00:00Z',
        slotStatus: 'Closed',
        page: 1,
      },
      signal,
    );
    await api.listSlotBookings(
      'ctx',
      'center-a',
      'slot-a',
      { bookingStatus: 'Pending', page: 2 },
      signal,
    );
    await api.getBookingContact('ctx', 'center-a', 'booking-a', signal);
    const urls = upstream.mock.calls.map(
      (call) => new URL(call[0], 'https://center.example.test'),
    );
    expect(urls[0]?.pathname).toBe(
      '/api/dashboard/v1/centers/center-a/calendar/slots',
    );
    expect(urls[0]?.searchParams.get('slotStatus')).toBe('Closed');
    expect(urls[1]?.searchParams.get('bookingStatus')).toBe('Pending');
    expect(urls[2]?.pathname).toBe(
      '/api/dashboard/v1/centers/center-a/bookings/booking-a/contact',
    );
    expect(urls[2]?.search).toBe('');
    for (const call of upstream.mock.calls) {
      expect(call[1].cache).toBe('no-store');
      expect(new Headers(call[1].headers).get('x-tenant-context')).toBe('ctx');
    }
  });

  it.each([Number.MAX_SAFE_INTEGER, 150_000_000_000, 0, -1])(
    'rejects unrepresentable or invalid durations: %s',
    (durationMinutes) => {
      expect(() => calendarSlotEnd({ ...slot, durationMinutes })).toThrow(
        RangeError,
      );
    },
  );
});
