'use client';

import { Temporal } from '@js-temporal/polyfill';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  LifeBuoy,
  type LucideIcon,
  MoreHorizontal,
  Plus,
  Sparkles,
  Users,
  Waves,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input, Select } from '../../components/ui/controls';
import {
  type CalendarObservation,
  calendarSlotEnd,
  loadCalendarActivities,
  loadCalendarSlots,
  loadUpcomingSlots,
} from './calendar-data';
import { CALENDAR_SEARCH_PARAMS } from './calendar-navigation';
import type { CatalogLocale, LocalizedText, SlotStatus } from './catalog-api';
import { CatalogNotice, describeCatalogError } from './catalog-feedback';
import { formatSlotStart } from './catalog-time';
import { dashboardCapabilitiesQuery } from './dashboard-capabilities';
import { useDashboardContext } from './dashboard-context';
import { PLACEHOLDER_PENDING_BOOKINGS } from './dashboard-placeholders';
import styles from './home.module.css';
import type { HomeCalendarRange } from './home-calendar';
import { type Center, DashboardApiError } from './tenant-context';
import {
  CATALOG_SEARCH_PARAMS,
  useCatalogNavigation,
} from './use-catalog-navigation';

const HomeCalendar = dynamic(() => import('./home-calendar'), {
  ssr: false,
  loading: () => <CatalogNotice title="Loading calendar" />,
});

const HOME_QUERY_ROOT = ['dashboard', 'catalog', 'home'] as const;

const SLOT_STATUSES: readonly SlotStatus[] = [
  'Available',
  'Full',
  'Closed',
  'Cancelled',
];

const slotStatusPresentation: Record<
  SlotStatus,
  {
    eventClassName: string | undefined;
    dotClassName: string;
    pillClassName: string;
  }
> = {
  Available: {
    eventClassName: styles.eventAvailable,
    dotClassName: 'bg-teal',
    pillClassName: 'bg-seafoam text-teal-dark',
  },
  Full: {
    eventClassName: styles.eventFull,
    dotClassName: 'bg-blue',
    pillClassName: 'bg-blue-soft text-blue-strong',
  },
  Closed: {
    eventClassName: styles.eventClosed,
    dotClassName: 'bg-violet',
    pillClassName: 'bg-violet-soft text-violet-strong',
  },
  Cancelled: {
    eventClassName: styles.eventCancelled,
    dotClassName: 'bg-coral',
    pillClassName: 'bg-coral-soft text-coral-strong',
  },
};

function activityLabel(name: LocalizedText, baseLocale: CatalogLocale) {
  return name.en ?? name[baseLocale] ?? '';
}

// Placeholder content until the backing reads and commands exist.
const PLACEHOLDER_METRICS = [
  {
    icon: CalendarDays,
    label: 'Bookings today',
    value: '8',
    note: '+2 vs. yesterday',
    tone: 'teal',
  },
  {
    icon: Users,
    label: 'Divers',
    value: '21',
    note: 'Across 6 activities',
    tone: 'blue',
  },
  {
    icon: ClipboardCheck,
    label: 'Pending approval',
    value: '3',
    note: 'Need attention',
    tone: 'coral',
  },
  {
    icon: Sparkles,
    label: 'Occupancy',
    value: '78%',
    note: '+12% this week',
    tone: 'violet',
  },
] as const;
const PLACEHOLDER_SEA_CONDITIONS = [
  { label: 'Water', value: '23°' },
  { label: 'Swell', value: '0.4 m' },
  { label: 'Visib.', value: '18 m' },
];

export function DashboardHome() {
  const { authorizedCenters, isReady, tenantContext } = useDashboardContext();
  const { requestedCenterId } = useCatalogNavigation();
  const center =
    authorizedCenters.find((item) => item.id === requestedCenterId) ??
    authorizedCenters[0];
  if (!isReady) return null;
  if (!center || !tenantContext)
    return <CatalogNotice title="No center is available" />;
  return (
    <CenterHome
      key={`${tenantContext}:${center.id}`}
      center={center}
      context={tenantContext}
    />
  );
}

function CenterHome({ center, context }: { center: Center; context: string }) {
  const { api, authorizedCenters, handleSessionExpired } =
    useDashboardContext();
  const { updateSearchParams } = useCatalogNavigation();
  const [calendarRange, setCalendarRange] = useState<HomeCalendarRange | null>(
    null,
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const capabilitiesQuery = useQuery(
    dashboardCapabilitiesQuery(api, context, center.id),
  );
  const capabilities = capabilitiesQuery.isError
    ? undefined
    : capabilitiesQuery.data;
  const canReadCatalog = capabilities?.canReadActivities === true;
  const canReadCalendar =
    canReadCatalog && capabilities?.canReadSessions === true;
  const activitiesQuery = useQuery({
    queryKey: [...HOME_QUERY_ROOT, 'activities', center.id],
    queryFn: ({ signal }) =>
      loadCalendarActivities(api, context, center.id, signal),
    enabled: capabilities?.canReadActivities === true,
    retry: false,
  });
  const activities = activitiesQuery.isError
    ? []
    : (activitiesQuery.data ?? []);
  const validTimeZone =
    formatSlotStart(new Date().toISOString(), 'en', center.timeZone) !== null;
  const slotsQuery = useQuery({
    queryKey: [
      ...HOME_QUERY_ROOT,
      'sessions',
      center.id,
      activities.map((activity) => activity.id),
    ],
    queryFn: ({ signal }) =>
      loadUpcomingSlots(
        api,
        context,
        center.id,
        activities.map((activity) => activity.id),
        new Date().toISOString(),
        signal,
      ),
    enabled:
      capabilities?.canReadActivities === true &&
      capabilities.canReadSessions &&
      validTimeZone &&
      activitiesQuery.isSuccess &&
      activities.length > 0,
    retry: false,
  });
  const calendarQuery = useQuery({
    queryKey: [...HOME_QUERY_ROOT, 'calendar', center.id, calendarRange],
    queryFn: ({ signal }) => {
      if (!calendarRange) throw new Error('Calendar range unavailable.');
      return loadCalendarSlots(
        api,
        context,
        center.id,
        null,
        calendarRange,
        '',
        signal,
      );
    },
    enabled: canReadCalendar && validTimeZone && calendarRange !== null,
    retry: false,
  });
  const errors = [
    capabilitiesQuery.error,
    activitiesQuery.error,
    slotsQuery.error,
    calendarQuery.error,
  ];
  const sessionExpired = errors.some(
    (error) =>
      error instanceof DashboardApiError && error.kind === 'session-expired',
  );
  useEffect(() => {
    if (sessionExpired) handleSessionExpired();
  }, [sessionExpired, handleSessionExpired]);

  const centerQuery = `center=${encodeURIComponent(center.id)}`;
  const catalogHref = `/dashboard/activities?${centerQuery}`;
  const calendarHref = `/dashboard/calendar?${centerQuery}`;
  const canScheduleSession =
    capabilities?.canScheduleSession === true &&
    canReadCatalog &&
    validTimeZone &&
    activitiesQuery.isSuccess &&
    activities.length > 0;
  const currentDate =
    capabilitiesQuery.dataUpdatedAt > 0 && validTimeZone
      ? new Intl.DateTimeFormat('en', {
          timeZone: center.timeZone as string,
          dateStyle: 'full',
        }).format(new Date(capabilitiesQuery.dataUpdatedAt))
      : null;
  const activityNames = new Map(
    activities.map((activity) => [
      activity.id,
      activityLabel(activity.name, activity.baseLocale),
    ]),
  );
  const calendarSlots = calendarQuery.isSuccess ? calendarQuery.data : [];
  const selectedSlot = calendarSlots.find((slot) => slot.id === selectedSlotId);
  const calendarEvents = calendarSlots.map((slot) => ({
    id: slot.id,
    title: activityLabel(slot.activity.name, slot.activity.baseLocale),
    start: slot.startsAt,
    end: calendarSlotEnd(slot),
    classNames: [slotStatusPresentation[slot.status].eventClassName ?? ''],
  }));

  let content: ReactNode;
  if (capabilitiesQuery.isPending) {
    content = <CatalogNotice title="Loading your workspace" />;
  } else if (capabilitiesQuery.error) {
    content = (
      <CatalogNotice
        title="Workspace permissions could not be loaded"
        message={describeCatalogError(capabilitiesQuery.error)}
      />
    );
  } else if (!canReadCatalog) {
    content = <CatalogNotice title="Activity access is unavailable" />;
  } else if (activitiesQuery.error) {
    content = (
      <CatalogNotice
        title="Activities could not be loaded"
        message={describeCatalogError(activitiesQuery.error)}
      />
    );
  } else if (activitiesQuery.isPending) {
    content = <CatalogNotice title="Loading activities" />;
  } else if (activities.length === 0) {
    content = <CatalogNotice title="No activities yet" />;
  } else if (!capabilities?.canReadSessions) {
    content = <CatalogNotice title="Session access is unavailable" />;
  } else if (!validTimeZone) {
    content = <CatalogNotice title="Center time zone is not configured" />;
  } else if (slotsQuery.error) {
    content = (
      <CatalogNotice
        title="Upcoming sessions could not be loaded"
        message={describeCatalogError(slotsQuery.error)}
      />
    );
  } else if (slotsQuery.isPending) {
    content = <CatalogNotice title="Loading upcoming sessions" />;
  } else if (slotsQuery.data.length === 0) {
    content = <CatalogNotice title="No upcoming sessions" />;
  } else {
    content = (
      <ol className="space-y-3">
        {slotsQuery.data.map((slot) => (
          <li
            key={slot.id}
            className="rounded-xl border border-line bg-slate-50/70 p-3.5"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-seafoam text-teal">
                <Clock3 className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/activities/${encodeURIComponent(slot.activityId)}/edit?${centerQuery}`}
                  className="block truncate text-sm font-semibold hover:text-teal"
                >
                  {activityNames.get(slot.activityId)}
                </Link>
                <div className="mt-0.5 text-xs text-muted">
                  {slot.durationMinutes} min · {slot.capacity} seats
                </div>
              </div>
              <StatusPill status={slot.status} />
            </div>
            <div className="mt-3 border-t border-line pt-3 text-xs font-medium text-muted">
              <time dateTime={slot.startsAt}>
                {formatSlotStart(slot.startsAt, 'en', center.timeZone)}
              </time>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <section className="@container text-ink" aria-labelledby="home-heading">
      <div className="@container min-w-0 space-y-6">
        <header className="flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="min-w-0 flex-1 basis-64">
            <h2
              id="home-heading"
              className="text-lg font-bold tracking-tight sm:text-xl"
            >
              {center.name}
            </h2>
            {currentDate && (
              <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm text-muted">
                {currentDate}{' '}
                <span className="text-xs text-muted">{center.timeZone}</span>
              </p>
            )}
          </div>
          {authorizedCenters.length > 1 && (
            <label className="grid min-w-0 gap-1.5" htmlFor="home-center">
              <span className="text-xs font-semibold text-muted">Center</span>
              <Select
                id="home-center"
                value={center.id}
                onChange={(event) =>
                  updateSearchParams({
                    [CATALOG_SEARCH_PARAMS.centerId]: event.target.value,
                  })
                }
              >
                {authorizedCenters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {(capabilities?.canCreateActivity || canScheduleSession) && (
            <div className="flex w-full flex-wrap gap-2 @2xl:w-auto">
              {capabilities?.canCreateActivity && (
                <Link
                  href={`/dashboard/activities/new?${centerQuery}`}
                  className="flex items-center gap-2 rounded-xl bg-teal px-3.5 py-2 text-sm font-semibold text-white shadow-button transition hover:bg-teal-dark"
                >
                  <Plus
                    className="size-4"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                  Create activity
                </Link>
              )}
              {canScheduleSession && (
                <Link
                  href={catalogHref}
                  className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-muted hover:border-slate-300 hover:text-ink"
                >
                  Schedule session
                </Link>
              )}
            </div>
          )}
        </header>

        <section
          aria-label="Center summary"
          className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4"
        >
          {PLACEHOLDER_METRICS.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <div className="grid min-w-0 gap-6 @6xl:grid-cols-[minmax(0,1fr)_21rem]">
          {canReadCalendar && validTimeZone && (
            <section
              aria-label="Session calendar"
              aria-busy={calendarQuery.isFetching}
              className="@container min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-card"
            >
              <HomeCalendar
                events={calendarEvents}
                timeZone={center.timeZone as string}
                actions={
                  <button
                    type="button"
                    onClick={() => setNewBookingOpen(true)}
                    className="flex items-center gap-2 rounded-xl bg-teal px-3.5 py-2 text-sm font-semibold text-white shadow-button transition hover:bg-teal-dark"
                  >
                    <Plus
                      className="size-4"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    New booking
                  </button>
                }
                legend={
                  <ul className="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-muted">
                    {SLOT_STATUSES.map((status) => (
                      <li key={status} className="flex items-center gap-2">
                        <span
                          className={`size-2.5 rounded-full ${slotStatusPresentation[status].dotClassName}`}
                          aria-hidden="true"
                        />
                        {status}
                      </li>
                    ))}
                  </ul>
                }
                status={
                  calendarQuery.error && (
                    <div className="px-4 pt-4 sm:px-5">
                      <CatalogNotice
                        title="Calendar could not be loaded"
                        message={describeCatalogError(calendarQuery.error)}
                      />
                    </div>
                  )
                }
                onRangeChange={(nextRange) =>
                  setCalendarRange((current) =>
                    current?.from === nextRange.from &&
                    current.to === nextRange.to
                      ? current
                      : nextRange,
                  )
                }
                onSelectSlot={setSelectedSlotId}
              />
            </section>
          )}

          <div className="grid content-start gap-6 @2xl:grid-cols-2 @6xl:grid-cols-1">
            <section
              className="rounded-2xl border border-line bg-white p-5 shadow-card"
              aria-labelledby="pending-heading"
            >
              <div className="mb-1 flex items-center justify-between">
                <div>
                  <h3 id="pending-heading" className="font-bold">
                    Pending approval
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {PLACEHOLDER_PENDING_BOOKINGS.length} pending requests
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink"
                  aria-label="More options"
                >
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                </button>
              </div>
              <ul className="mt-4 space-y-3">
                {PLACEHOLDER_PENDING_BOOKINGS.map((booking) => (
                  <li
                    key={booking.id}
                    className="rounded-xl border border-line bg-slate-50/70 p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-coral-soft text-coral-strong">
                        <Clock3 className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {booking.activity}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {booking.customer} · {booking.participants} people
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                      <div className="text-xs font-medium text-muted">
                        {booking.when}
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-lg bg-teal px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark"
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        Approve
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section
              className="rounded-2xl border border-line bg-white p-5 shadow-card"
              aria-labelledby="upcoming-heading"
              aria-busy={
                capabilitiesQuery.isFetching ||
                activitiesQuery.isFetching ||
                slotsQuery.isFetching
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="upcoming-heading" className="font-bold">
                    Upcoming sessions
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Next sessions across your activities
                  </p>
                </div>
                {canReadCalendar && (
                  <Link
                    href={calendarHref}
                    className="text-sm font-semibold text-teal hover:text-teal-dark"
                  >
                    View calendar
                  </Link>
                )}
              </div>
              <div className="mt-4">{content}</div>
            </section>

            <section
              className={`overflow-hidden rounded-2xl p-5 text-white shadow-ocean ${styles.seaConditions}`}
              aria-labelledby="sea-heading"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3
                    id="sea-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-cyan-100/70"
                  >
                    Sea conditions
                  </h3>
                  <div className="mt-2 text-2xl font-bold">Optimal</div>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur">
                  <Waves className="size-6 text-aqua" aria-hidden="true" />
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3">
                {PLACEHOLDER_SEA_CONDITIONS.map((condition) => (
                  <div
                    key={condition.label}
                    className="rounded-xl bg-white/10 p-2.5"
                  >
                    <dt className="text-xs font-medium text-cyan-100/70">
                      {condition.label}
                    </dt>
                    <dd className="mt-1 text-sm font-bold">
                      {condition.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-cyan-50/70">
                <LifeBuoy className="size-3.5" aria-hidden="true" />
                Updated 12 min ago
              </div>
            </section>
          </div>
        </div>
      </div>

      {selectedSlot && (
        <SlotDetailDialog
          slot={selectedSlot}
          timeZone={center.timeZone as string}
          centerQuery={centerQuery}
          canUpdateActivity={capabilities?.canUpdateActivity === true}
          onClose={() => setSelectedSlotId(null)}
        />
      )}
      {newBookingOpen && (
        <NewBookingDialog
          activityNames={[...activityNames.values()]}
          timeZone={validTimeZone ? (center.timeZone as string) : null}
          onClose={() => setNewBookingOpen(false)}
        />
      )}
    </section>
  );
}

const metricTones = {
  teal: 'bg-seafoam text-teal-dark',
  blue: 'bg-blue-soft text-blue-strong',
  coral: 'bg-coral-soft text-coral-strong',
  violet: 'bg-violet-soft text-violet-strong',
};

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone: keyof typeof metricTones;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${metricTones[tone]}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">{value}</span>
          <span
            className={`truncate text-xs font-semibold ${
              tone === 'coral' ? 'text-coral-strong' : 'text-teal-dark'
            }`}
          >
            {note}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: SlotStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${slotStatusPresentation[status].pillClassName}`}
    >
      {status}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function DialogFrame({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, []);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // The dashboard frame establishes a containing block for fixed descendants.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-dialog-heading"
        className="w-full max-w-md rounded-2xl border border-white/40 bg-white p-6 text-ink shadow-modal"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id="home-dialog-heading" className="text-lg font-bold">
              {title}
            </h3>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function SlotDetailDialog({
  slot,
  timeZone,
  centerQuery,
  canUpdateActivity,
  onClose,
}: {
  slot: CalendarObservation;
  timeZone: string;
  centerQuery: string;
  canUpdateActivity: boolean;
  onClose: () => void;
}) {
  const localDate = Temporal.Instant.from(slot.startsAt)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
  const dayCalendarHref = `/dashboard/calendar?${centerQuery}&${CALENDAR_SEARCH_PARAMS.view}=timeGridDay&${CALENDAR_SEARCH_PARAMS.date}=${localDate}`;

  return (
    <DialogFrame
      title={activityLabel(slot.activity.name, slot.activity.baseLocale)}
      description="Session detail"
      onClose={onClose}
    >
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Detail
            label="Starts"
            value={
              <time dateTime={slot.startsAt}>
                {formatSlotStart(slot.startsAt, 'en', timeZone)}
              </time>
            }
          />
        </div>
        <Detail label="Duration" value={`${slot.durationMinutes} min`} />
        <Detail label="Capacity" value={slot.capacity} />
        <Detail label="Confirmed seats" value={slot.confirmedSeats} />
        <Detail label="Held seats" value={slot.heldSeats} />
        <div className="col-span-2">
          <Detail
            label="Remaining seats"
            value={slot.remainingSeats ?? 'Unavailable'}
          />
        </div>
      </dl>

      <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <StatusPill status={slot.status} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={dayCalendarHref}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal py-3 text-sm font-bold text-white hover:bg-teal-dark"
        >
          Manage in calendar
        </Link>
        {canUpdateActivity && (
          <Link
            href={`/dashboard/activities/${encodeURIComponent(slot.activityId)}/edit?${centerQuery}`}
            className="flex flex-1 items-center justify-center rounded-xl border border-line py-3 text-sm font-semibold text-muted hover:text-ink"
          >
            Edit activity
          </Link>
        )}
      </div>
    </DialogFrame>
  );
}

const PLACEHOLDER_BOOKING_ACTIVITIES = [
  'Discover scuba',
  'Guided dive',
  'Open Water course',
  'Boat trip',
];

function NewBookingDialog({
  activityNames,
  timeZone,
  onClose,
}: {
  activityNames: string[];
  timeZone: string | null;
  onClose: () => void;
}) {
  const options =
    activityNames.length > 0 ? activityNames : PLACEHOLDER_BOOKING_ACTIVITIES;
  const tomorrow = (
    timeZone ? Temporal.Now.plainDateISO(timeZone) : Temporal.Now.plainDateISO()
  )
    .add({ days: 1 })
    .toString();
  const labelClassName = 'mb-1.5 block text-xs font-semibold text-muted';

  return (
    <DialogFrame
      title="New booking"
      description="Register a request in the calendar"
      onClose={onClose}
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <label className="block" htmlFor="new-booking-activity">
          <span className={labelClassName}>Activity</span>
          <Select id="new-booking-activity">
            {options.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
        </label>
        <label className="block" htmlFor="new-booking-customer">
          <span className={labelClassName}>Customer name</span>
          <Input
            id="new-booking-customer"
            required
            placeholder="First and last name"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor="new-booking-date">
            <span className={labelClassName}>Date</span>
            <Input id="new-booking-date" type="date" defaultValue={tomorrow} />
          </label>
          <label htmlFor="new-booking-participants">
            <span className={labelClassName}>Participants</span>
            <Input
              id="new-booking-participants"
              type="number"
              min="1"
              defaultValue="2"
            />
          </label>
        </div>
        <button
          type="submit"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal py-3 text-sm font-bold text-white hover:bg-teal-dark"
        >
          <Plus className="size-4" aria-hidden="true" />
          Create request
        </button>
      </form>
    </DialogFrame>
  );
}
