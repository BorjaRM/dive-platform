import type { CalendarSlotRead } from './calendar-api';
import type { CatalogActivity, CatalogSlot, SlotStatus } from './catalog-api';
import type { DashboardApi } from './tenant-context';

export type CalendarObservation = CalendarSlotRead & { asOf: string };

export async function loadCalendarActivities(
  api: DashboardApi,
  context: string,
  centerId: string,
  signal: AbortSignal,
): Promise<CatalogActivity[]> {
  const activities = new Map<string, CatalogActivity>();
  let page = 1;
  while (true) {
    signal.throwIfAborted();
    const response = await api.listActivities(
      context,
      centerId,
      { page, pageSize: 50 },
      signal,
    );
    for (const activity of response.items)
      activities.set(activity.id, activity);
    if (!response.hasNext) return [...activities.values()];
    page += 1;
  }
}

export async function loadCalendarSlots(
  api: DashboardApi,
  context: string,
  centerId: string,
  activityId: string | null,
  range: { from: string; to: string },
  status: SlotStatus | '',
  signal: AbortSignal,
): Promise<CalendarObservation[]> {
  const slots = new Map<string, CalendarObservation>();
  let page = 1;
  while (true) {
    signal.throwIfAborted();
    const response = await api.listCalendarSlots(
      context,
      centerId,
      {
        ...range,
        page,
        pageSize: 50,
        ...(activityId ? { activityId } : {}),
        ...(status ? { slotStatus: status } : {}),
      },
      signal,
    );
    signal.throwIfAborted();
    if (!Number.isFinite(Date.parse(response.asOf)))
      throw new RangeError('Calendar observation unavailable.');
    for (const slot of response.items) {
      calendarSlotEnd(slot);
      if (
        ![slot.confirmedSeats, slot.heldSeats].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ) ||
        (slot.remainingSeats !== null &&
          (!Number.isSafeInteger(slot.remainingSeats) ||
            slot.remainingSeats < 0))
      ) {
        throw new RangeError('Calendar occupancy unavailable.');
      }
      slots.set(slot.id, { ...slot, asOf: response.asOf });
    }
    if (!response.hasNext) return [...slots.values()];
    page += 1;
  }
}

export async function loadUpcomingSlots(
  api: DashboardApi,
  context: string,
  centerId: string,
  from: string,
  signal: AbortSignal,
): Promise<CatalogSlot[]> {
  signal.throwIfAborted();
  const response = await api.listUpcomingSlots(
    context,
    centerId,
    { from },
    signal,
  );
  signal.throwIfAborted();
  for (const slot of response.items) calendarSlotEnd(slot);
  return response.items;
}

export function calendarSlotEnd(slot: CatalogSlot): string {
  const durationMilliseconds = slot.durationMinutes * 60_000;
  const endMilliseconds = Date.parse(slot.startsAt) + durationMilliseconds;
  if (
    !Number.isSafeInteger(slot.durationMinutes) ||
    slot.durationMinutes <= 0 ||
    !Number.isSafeInteger(durationMilliseconds) ||
    !Number.isSafeInteger(endMilliseconds)
  ) {
    throw new RangeError('The slot duration cannot be displayed.');
  }
  const end = new Date(endMilliseconds);
  if (!Number.isFinite(end.getTime()))
    throw new RangeError('The slot end is outside the supported date range.');
  return end.toISOString();
}
