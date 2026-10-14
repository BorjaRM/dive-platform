'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ActivityStatus, SlotStatus } from './catalog-api';
import { useDashboardContext } from './dashboard-context';
import type { Center } from './tenant-context';

export const CATALOG_SEARCH_PARAMS = {
  activityId: 'activity',
  activityPage: 'activityPage',
  activityStatus: 'activityStatus',
  centerId: 'center',
  slotPage: 'slotPage',
  slotStatus: 'slotStatus',
} as const;

export type ActivityStatusFilter = ActivityStatus | '';
export type SlotStatusFilter = SlotStatus | '';

export type DashboardCenterSelection =
  | {
      kind: 'selected';
      center: Center;
      repair: 'missing' | 'invalid' | null;
    }
  | { kind: 'needs-selection' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function parseActivityStatus(value: string | null): ActivityStatusFilter {
  return value === 'Draft' || value === 'Published' || value === 'Disabled'
    ? value
    : '';
}

function parseSlotStatus(value: string | null): SlotStatusFilter {
  return value === 'Available' ||
    value === 'Full' ||
    value === 'Closed' ||
    value === 'Cancelled'
    ? value
    : '';
}

function applySearchParamUpdates(
  searchParams: URLSearchParams,
  updates: Record<string, string | number | null>,
  includeCenter: boolean,
) {
  if (!includeCenter) searchParams.delete(CATALOG_SEARCH_PARAMS.centerId);
  for (const [key, value] of Object.entries(updates)) {
    if (key === CATALOG_SEARCH_PARAMS.centerId && !includeCenter) continue;
    if (value === null || value === '') searchParams.delete(key);
    else searchParams.set(key, String(value));
  }
}

export function useCatalogNavigation() {
  const { authorizedCenters, centerSelectionMode } = useDashboardContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsValue = searchParams.toString();
  const requestedCenterId =
    searchParams.get(CATALOG_SEARCH_PARAMS.centerId) ?? '';
  const includeCenterInUrl = centerSelectionMode === 'url';
  const firstCenter = authorizedCenters[0];
  let centerSelection: DashboardCenterSelection;
  if (!firstCenter) {
    centerSelection = { kind: 'unavailable' };
  } else if (centerSelectionMode === 'host') {
    centerSelection = {
      kind: 'selected',
      center: firstCenter,
      repair: null,
    };
  } else {
    const requestedCenter = authorizedCenters.find(
      (center) => center.id === requestedCenterId,
    );
    if (requestedCenter) {
      centerSelection = {
        kind: 'selected',
        center: requestedCenter,
        repair: null,
      };
    } else if (authorizedCenters.length === 1) {
      centerSelection = {
        kind: 'selected',
        center: firstCenter,
        repair: requestedCenterId ? 'invalid' : 'missing',
      };
    } else {
      centerSelection = {
        kind: requestedCenterId ? 'invalid' : 'needs-selection',
      };
    }
  }
  const selectedCenterId =
    centerSelection.kind === 'selected' ? centerSelection.center.id : null;

  const updateSearchParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const nextSearchParams = new URLSearchParams(searchParamsValue);
      applySearchParamUpdates(nextSearchParams, updates, includeCenterInUrl);
      const query = nextSearchParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [includeCenterInUrl, pathname, router, searchParamsValue],
  );

  const navigate = useCallback(
    (path: string, updates: Record<string, string | number | null> = {}) => {
      const nextSearchParams = new URLSearchParams(searchParamsValue);
      applySearchParamUpdates(nextSearchParams, updates, includeCenterInUrl);
      nextSearchParams.delete(CATALOG_SEARCH_PARAMS.activityId);
      nextSearchParams.delete(CATALOG_SEARCH_PARAMS.slotPage);
      const query = nextSearchParams.toString();
      router.push(query ? `${path}?${query}` : path);
    },
    [includeCenterInUrl, router, searchParamsValue],
  );

  const buildHref = useCallback(
    (path: string, updates: Record<string, string | number | null> = {}) => {
      const nextSearchParams = new URLSearchParams();
      if (includeCenterInUrl && selectedCenterId)
        nextSearchParams.set(CATALOG_SEARCH_PARAMS.centerId, selectedCenterId);
      applySearchParamUpdates(nextSearchParams, updates, includeCenterInUrl);
      const query = nextSearchParams.toString();
      return query ? `${path}?${query}` : path;
    },
    [includeCenterInUrl, selectedCenterId],
  );

  return {
    centerSelection,
    buildHref,
    navigate,
    requestedCenterId,
    selectedActivityId: searchParams.get(CATALOG_SEARCH_PARAMS.activityId),
    activityStatus: parseActivityStatus(
      searchParams.get(CATALOG_SEARCH_PARAMS.activityStatus),
    ),
    slotStatus: parseSlotStatus(
      searchParams.get(CATALOG_SEARCH_PARAMS.slotStatus),
    ),
    activityPage: parsePage(
      searchParams.get(CATALOG_SEARCH_PARAMS.activityPage),
    ),
    slotPage: parsePage(searchParams.get(CATALOG_SEARCH_PARAMS.slotPage)),
    updateSearchParams,
  };
}
