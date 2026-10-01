'use client';

import { Temporal } from '@js-temporal/polyfill';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import type { SlotStatus } from './catalog-api';
import { CATALOG_SEARCH_PARAMS } from './use-catalog-navigation';

export const CALENDAR_VIEWS = [
  'dayGridMonth',
  'timeGridWeek',
  'timeGridDay',
  'listWeek',
] as const;
export type CalendarViewName = (typeof CALENDAR_VIEWS)[number];
export const CALENDAR_SEARCH_PARAMS = {
  view: 'calendarView',
  date: 'calendarDate',
} as const;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slotStatuses: readonly SlotStatus[] = [
  'Available',
  'Full',
  'Closed',
  'Cancelled',
];

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    Temporal.PlainDate.from(value, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

export function resolveCalendarNavigation(
  search: string,
  timeZone: string | null,
  now: string,
) {
  if (!timeZone) return null;
  let today: string;
  try {
    today = Temporal.Instant.from(now)
      .toZonedDateTimeISO(timeZone)
      .toPlainDate()
      .toString();
  } catch {
    return null;
  }
  const params = new URLSearchParams(search);
  const views = params.getAll(CALENDAR_SEARCH_PARAMS.view);
  const dates = params.getAll(CALENDAR_SEARCH_PARAMS.date);
  const invalidNavigation =
    views.length > 1 ||
    dates.length > 1 ||
    (views.length === 1 &&
      !CALENDAR_VIEWS.includes(views[0] as CalendarViewName)) ||
    (dates.length === 1 && !validDate(dates[0] as string));
  const view: CalendarViewName = invalidNavigation
    ? 'timeGridWeek'
    : ((views[0] as CalendarViewName | undefined) ?? 'timeGridWeek');
  const date = invalidNavigation ? today : (dates[0] ?? today);
  params.set(CALENDAR_SEARCH_PARAMS.view, view);
  params.set(CALENDAR_SEARCH_PARAMS.date, date);
  const activities = params.getAll(CATALOG_SEARCH_PARAMS.activityId);
  const activityId =
    activities.length === 1 && uuid.test(activities[0] as string)
      ? (activities[0] as string)
      : null;
  if (!activityId) params.delete(CATALOG_SEARCH_PARAMS.activityId);
  const statuses = params.getAll(CATALOG_SEARCH_PARAMS.slotStatus);
  const slotStatus: SlotStatus | '' =
    statuses.length === 1 && slotStatuses.includes(statuses[0] as SlotStatus)
      ? (statuses[0] as SlotStatus)
      : '';
  if (!slotStatus) params.delete(CATALOG_SEARCH_PARAMS.slotStatus);
  return { view, date, activityId, slotStatus, canonical: params.toString() };
}

export function useCalendarNavigation(timeZone: string | null) {
  const search = useSearchParams().toString();
  const pathname = usePathname();
  const router = useRouter();
  const navigation = resolveCalendarNavigation(
    search,
    timeZone,
    new Date().toISOString(),
  );
  const canonical = navigation?.canonical;
  useEffect(() => {
    if (canonical !== undefined && canonical !== search) {
      router.replace(`${pathname}?${canonical}`, { scroll: false });
    }
  }, [canonical, search, pathname, router]);
  return navigation;
}
