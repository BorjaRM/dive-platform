'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ActivityStatus, SlotStatus } from './catalog-api';

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

export function useCatalogNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsValue = searchParams.toString();
  const updateSearchParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const nextSearchParams = new URLSearchParams(searchParamsValue);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') nextSearchParams.delete(key);
        else nextSearchParams.set(key, String(value));
      }
      const query = nextSearchParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsValue],
  );

  return {
    requestedCenterId: searchParams.get(CATALOG_SEARCH_PARAMS.centerId) ?? '',
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
