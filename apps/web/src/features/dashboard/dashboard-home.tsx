'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type ReactNode, useEffect } from 'react';
import { Badge, Select } from '../../components/ui/controls';
import { loadCalendarActivities, loadUpcomingSlots } from './calendar-data';
import { CatalogNotice, describeCatalogError } from './catalog-feedback';
import { formatSlotStart } from './catalog-time';
import { useDashboardContext } from './dashboard-context';
import styles from './home.module.css';
import { type Center, DashboardApiError } from './tenant-context';
import {
  CATALOG_SEARCH_PARAMS,
  useCatalogNavigation,
} from './use-catalog-navigation';

const HOME_QUERY_ROOT = ['dashboard', 'catalog', 'home'] as const;

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
  const capabilitiesQuery = useQuery({
    queryKey: [...HOME_QUERY_ROOT, 'capabilities', center.id],
    queryFn: ({ signal }) =>
      api.getDashboardCapabilities(context, center.id, signal),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const capabilities = capabilitiesQuery.isError
    ? undefined
    : capabilitiesQuery.data;
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
  const errors = [
    capabilitiesQuery.error,
    activitiesQuery.error,
    slotsQuery.error,
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
  const canReadCatalog = capabilities?.canReadActivities === true;
  const canReadCalendar =
    canReadCatalog && capabilities?.canReadSessions === true;
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
      activity.name.en ?? activity.name[activity.baseLocale] ?? '',
    ]),
  );

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
      <ol className={styles.sessions}>
        {slotsQuery.data.map((slot) => (
          <li key={slot.id} className={styles.session}>
            <time dateTime={slot.startsAt} className={styles.start}>
              {formatSlotStart(slot.startsAt, 'en', center.timeZone)}
            </time>
            <div className={styles.activity}>
              <Link
                href={`/dashboard/activities/${encodeURIComponent(slot.activityId)}/edit?${centerQuery}`}
                className={styles.activityLink}
              >
                {activityNames.get(slot.activityId)}
              </Link>
              <span className={styles.helper}>{slot.durationMinutes} min</span>
            </div>
            <Badge
              variant={slot.status === 'Available' ? 'success' : 'neutral'}
            >
              {slot.status}
            </Badge>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <section className={styles.home} aria-labelledby="home-heading">
      <nav className={styles.navigation} aria-label="Dashboard navigation">
        <Link
          href={`/dashboard?${centerQuery}`}
          aria-current="page"
          className={styles.navigationLink}
        >
          Home
        </Link>
        {canReadCalendar && (
          <Link href={calendarHref} className={styles.navigationLink}>
            Calendar
          </Link>
        )}
        {canReadCatalog && (
          <Link href={catalogHref} className={styles.navigationLink}>
            Activities
          </Link>
        )}
      </nav>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h2 id="home-heading">{center.name}</h2>
          {currentDate && (
            <p className={styles.date}>
              {currentDate}{' '}
              <span className={styles.helper}>{center.timeZone}</span>
            </p>
          )}
        </div>
        {authorizedCenters.length > 1 && (
          <label className={styles.center} htmlFor="home-center">
            <span className={styles.label}>Center</span>
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
      </header>
      <div className={styles.actions}>
        {capabilities?.canCreateActivity && (
          <Link
            href={`/dashboard/activities/new?${centerQuery}`}
            className={styles.actionLink}
          >
            Create activity
          </Link>
        )}
        {capabilities?.canScheduleSession &&
          canReadCatalog &&
          validTimeZone &&
          activitiesQuery.isSuccess &&
          activities.length > 0 && (
            <Link href={catalogHref} className={styles.actionLink}>
              Schedule session
            </Link>
          )}
      </div>
      <section
        className={styles.upcoming}
        aria-labelledby="upcoming-heading"
        aria-busy={
          capabilitiesQuery.isFetching ||
          activitiesQuery.isFetching ||
          slotsQuery.isFetching
        }
      >
        <div className={styles.sectionHeading}>
          <h3 id="upcoming-heading">Upcoming sessions</h3>
          {canReadCalendar && (
            <Link href={calendarHref} className={styles.navigationLink}>
              View calendar
            </Link>
          )}
        </div>
        {content}
      </section>
    </section>
  );
}
