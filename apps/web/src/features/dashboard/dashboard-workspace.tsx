'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Anchor,
  Bell,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  Search,
  Settings,
  ShipWheel,
  Users,
  Waves,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { dashboardCapabilitiesQuery } from './dashboard-capabilities';
import { useDashboardContext } from './dashboard-context';
import {
  PLACEHOLDER_PENDING_BOOKINGS,
  PLACEHOLDER_USER,
} from './dashboard-placeholders';
import { CATALOG_SEARCH_PARAMS } from './use-catalog-navigation';

export function DashboardWorkspace({
  actions,
  hasCenterRoute,
  children,
}: {
  actions: ReactNode;
  hasCenterRoute: boolean;
  children: ReactNode;
}) {
  const { api, authorizedCenters, isReady, tenantContext } =
    useDashboardContext();
  const pathname = usePathname() ?? '';
  const requestedCenterId =
    useSearchParams()?.get(CATALOG_SEARCH_PARAMS.centerId) ?? null;
  const [navigationOpen, setNavigationOpen] = useState(false);
  const center =
    authorizedCenters.find((item) => item.id === requestedCenterId) ??
    authorizedCenters[0];
  const capabilitiesQuery = useQuery({
    ...dashboardCapabilitiesQuery(api, tenantContext ?? '', center?.id ?? ''),
    enabled:
      hasCenterRoute &&
      isReady &&
      tenantContext !== null &&
      center !== undefined,
  });
  const capabilities = capabilitiesQuery.isError
    ? undefined
    : capabilitiesQuery.data;
  const canReadCatalog = capabilities?.canReadActivities === true;
  const canReadCalendar =
    canReadCatalog && capabilities?.canReadSessions === true;
  const centerQuery = center ? `?center=${encodeURIComponent(center.id)}` : '';
  const closeNavigation = () => setNavigationOpen(false);

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {navigationOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={closeNavigation}
        />
      )}
      <aside
        id="dashboard-navigation"
        className={`${navigationOpen ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-50 w-64 flex-col overflow-y-auto bg-navy px-4 py-6 text-white lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-dvh lg:w-auto`}
      >
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-aqua text-navy shadow-glow">
            <Anchor className="size-5" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-bold tracking-tight">BlueCurrent</div>
            <div className="text-xs font-medium text-slate-400">
              Dive center manager
            </div>
          </div>
        </div>

        <nav aria-label="Dashboard navigation" className="mt-10">
          <div className="mb-3 px-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Management
          </div>
          <ul className="space-y-1">
            <NavigationLink
              href={`/dashboard${centerQuery}`}
              icon={LayoutDashboard}
              current={pathname === '/dashboard'}
              onNavigate={closeNavigation}
            >
              Home
            </NavigationLink>
            {canReadCalendar && (
              <NavigationLink
                href={`/dashboard/calendar${centerQuery}`}
                icon={CalendarDays}
                current={pathname.startsWith('/dashboard/calendar')}
                onNavigate={closeNavigation}
              >
                Calendar
              </NavigationLink>
            )}
            <NavigationLink
              icon={ClipboardCheck}
              badge={String(PLACEHOLDER_PENDING_BOOKINGS.length)}
            >
              Bookings
            </NavigationLink>
            {canReadCatalog && (
              <NavigationLink
                href={`/dashboard/activities${centerQuery}`}
                icon={Waves}
                current={pathname.startsWith('/dashboard/activities')}
                onNavigate={closeNavigation}
              >
                Activities
              </NavigationLink>
            )}
            <NavigationLink icon={Users}>Customers</NavigationLink>
          </ul>
        </nav>

        <div className="mt-auto pt-8">
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ShipWheel className="size-4 text-aqua" aria-hidden="true" />
              Center status
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>Operational</span>
              <span className="flex items-center gap-1.5 font-medium text-mint">
                <span
                  className="size-1.5 rounded-full bg-mint"
                  aria-hidden="true"
                />
                Calm sea
              </span>
            </div>
          </div>
          <ul>
            <NavigationLink icon={Settings}>Settings</NavigationLink>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 px-1 pt-4">
            {actions}
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink lg:hidden"
            aria-expanded={navigationOpen}
            aria-controls="dashboard-navigation"
            aria-label={navigationOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setNavigationOpen((open) => !open)}
          >
            {navigationOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">
              Good morning, {PLACEHOLDER_USER.firstName}
            </h1>
            <p className="hidden truncate text-sm text-muted sm:block">
              Here is the pulse of your dive center.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium text-muted shadow-soft transition hover:border-slate-300 hover:text-ink md:flex"
            >
              <Search className="size-4" aria-hidden="true" />
              Search
              <kbd className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-muted">
                ⌘ K
              </kbd>
            </button>
            <button
              type="button"
              className="relative rounded-xl border border-line bg-white p-2.5 text-muted shadow-soft hover:text-ink"
              aria-label="Notifications"
            >
              <Bell className="size-5" aria-hidden="true" />
              <span
                className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-coral"
                aria-hidden="true"
              />
            </button>
            <div className="flex items-center gap-3 border-l border-line pl-3">
              <div
                className="flex size-10 items-center justify-center rounded-xl bg-seafoam text-sm font-bold text-teal-dark"
                aria-hidden="true"
              >
                {PLACEHOLDER_USER.initials}
              </div>
              <div className="hidden lg:block">
                <div className="text-sm font-semibold">
                  {PLACEHOLDER_USER.fullName}
                </div>
                <div className="text-xs text-muted">
                  {PLACEHOLDER_USER.role}
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavigationLink({
  href,
  icon: Icon,
  current = false,
  badge,
  onNavigate,
  children,
}: {
  href?: string;
  icon: LucideIcon;
  current?: boolean;
  badge?: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const className = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    current
      ? 'bg-white/10 text-white'
      : 'text-slate-400 hover:bg-white/5 hover:text-white'
  }`;
  const content = (
    <>
      <Icon
        className={`size-5 ${current ? 'text-aqua' : ''}`}
        aria-hidden="true"
      />
      {children}
      {badge && (
        <span className="ml-auto rounded-full bg-coral-strong px-2 py-0.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          aria-current={current ? 'page' : undefined}
          className={className}
          onClick={() => onNavigate?.()}
        >
          {content}
        </Link>
      ) : (
        <button type="button" className={className}>
          {content}
        </button>
      )}
    </li>
  );
}
