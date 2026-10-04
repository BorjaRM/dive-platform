import type { DashboardRequest } from './tenant-context';

export type LocalizedText = {
  es?: string;
  en?: string;
};

export type CatalogLocale = 'es' | 'en';

export type CatalogSettings = {
  defaultActivityLocale: CatalogLocale | null;
};

export type DashboardCapabilities = {
  canReadActivities: boolean;
  canReadSessions: boolean;
  canCreateActivity: boolean;
  canUpdateActivity: boolean;
  canPublishActivity: boolean;
  canScheduleSession: boolean;
};

export type ActivityStatus = 'Draft' | 'Published' | 'Disabled';

export type SlotStatus = 'Available' | 'Full' | 'Closed' | 'Cancelled';

export type CatalogActivity = {
  id: string;
  status: ActivityStatus;
  baseLocale: CatalogLocale;
  name: LocalizedText;
  description?: LocalizedText;
  defaultCapacity?: number;
  createdAt: string;
};

export type CatalogSlot = {
  id: string;
  activityId: string;
  status: SlotStatus;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  createdAt: string;
};

export type CatalogListResponse<Item> = {
  items: Item[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};

export type CatalogActivityList = CatalogListResponse<CatalogActivity>;

export type CatalogSlotList = CatalogListResponse<CatalogSlot>;

export type CatalogActivityListQuery = {
  page?: number;
  pageSize?: number;
  status?: ActivityStatus;
};

export type CatalogSlotListQuery = {
  page?: number;
  pageSize?: number;
  status?: SlotStatus;
  from?: string;
  to?: string;
};

export type CreateCatalogActivityInput = {
  name: LocalizedText;
  description?: LocalizedText;
  defaultCapacity?: number;
};

export type CreateCatalogSlotInput = {
  startsAt: string;
  durationMinutes: number;
  capacity: number;
};

export type UpdateCatalogActivityInput =
  | {
      group: 'translation';
      locale: CatalogLocale;
      values: { name: string; description: string };
    }
  | { group: 'common'; values: { defaultCapacity: number | null } };

export type CatalogActivityDetail = { activity: CatalogActivity; etag: string };

function requireActivityEtag(etag: string | null) {
  if (!etag)
    throw new Error('Activity revision is unavailable. Reload before saving.');
  return etag;
}

function withListQuery(
  path: string,
  query: CatalogActivityListQuery | CatalogSlotListQuery,
) {
  const search = new URLSearchParams();
  if (query.page !== undefined) search.set('page', String(query.page));
  if (query.pageSize !== undefined)
    search.set('pageSize', String(query.pageSize));
  if (query.status !== undefined) search.set('status', query.status);
  if ('from' in query && query.from !== undefined)
    search.set('from', query.from);
  if ('to' in query && query.to !== undefined) search.set('to', query.to);
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function activityPath(centerId: string) {
  return `/v1/centers/${encodeURIComponent(centerId)}/activities`;
}

function slotsPath(centerId: string, activityId: string) {
  return `${activityPath(centerId)}/${encodeURIComponent(activityId)}/slots`;
}

function activityInputBody(input: CreateCatalogActivityInput) {
  return {
    name: input.name,
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(input.defaultCapacity === undefined
      ? {}
      : { defaultCapacity: input.defaultCapacity }),
  };
}

function slotInputBody(input: CreateCatalogSlotInput) {
  return {
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    capacity: input.capacity,
  };
}

export function createCatalogApi({ request }: { request: DashboardRequest }) {
  return {
    getDashboardCapabilities: async (
      tenantContext: string,
      centerId: string,
      signal?: AbortSignal,
    ): Promise<DashboardCapabilities> => {
      const capabilities = await request<DashboardCapabilities | null>(
        `/v1/centers/${encodeURIComponent(centerId)}/dashboard-capabilities`,
        { context: tenantContext, signal },
      );
      if (
        !capabilities ||
        typeof capabilities.canReadActivities !== 'boolean' ||
        typeof capabilities.canReadSessions !== 'boolean' ||
        typeof capabilities.canCreateActivity !== 'boolean' ||
        typeof capabilities.canUpdateActivity !== 'boolean' ||
        typeof capabilities.canPublishActivity !== 'boolean' ||
        typeof capabilities.canScheduleSession !== 'boolean'
      ) {
        throw new Error('Dashboard permissions are unavailable.');
      }
      return capabilities;
    },
    getCatalogSettings: (
      tenantContext: string,
      centerId: string,
      signal?: AbortSignal,
    ) =>
      request<CatalogSettings>(
        `/v1/centers/${encodeURIComponent(centerId)}/catalog-settings`,
        { context: tenantContext, signal },
      ),
    selectCatalogLanguage: (
      tenantContext: string,
      centerId: string,
      defaultActivityLocale: CatalogLocale,
      signal?: AbortSignal,
    ) =>
      request<void>(
        `/v1/centers/${encodeURIComponent(centerId)}/catalog-settings`,
        {
          method: 'PUT',
          context: tenantContext,
          body: { defaultActivityLocale },
          signal,
        },
      ),
    listActivities: (
      tenantContext: string,
      centerId: string,
      query: CatalogActivityListQuery = {},
      signal?: AbortSignal,
    ) =>
      request<CatalogActivityList>(
        withListQuery(activityPath(centerId), query),
        { context: tenantContext, signal },
      ),
    createActivity: (
      tenantContext: string,
      centerId: string,
      input: CreateCatalogActivityInput,
      signal?: AbortSignal,
    ) =>
      request<CatalogActivity>(activityPath(centerId), {
        method: 'POST',
        context: tenantContext,
        body: activityInputBody(input),
        signal,
      }),
    getActivity: async (
      tenantContext: string,
      centerId: string,
      activityId: string,
      signal?: AbortSignal,
    ): Promise<CatalogActivityDetail> => {
      let etag: string | null = null;
      const activity = await request<CatalogActivity>(
        `${activityPath(centerId)}/${encodeURIComponent(activityId)}`,
        {
          context: tenantContext,
          signal,
          onResponseHeaders: (headers) => {
            etag = headers.get('etag');
          },
        },
      );
      return { activity, etag: requireActivityEtag(etag) };
    },
    updateActivity: async (
      tenantContext: string,
      centerId: string,
      activityId: string,
      input: UpdateCatalogActivityInput,
      ifMatch: string,
      signal?: AbortSignal,
    ): Promise<string> => {
      let etag: string | null = null;
      await request<void>(
        `${activityPath(centerId)}/${encodeURIComponent(activityId)}`,
        {
          method: 'PUT',
          context: tenantContext,
          body: input,
          ifMatch,
          signal,
          onResponseHeaders: (headers) => {
            etag = headers.get('etag');
          },
        },
      );
      return requireActivityEtag(etag);
    },
    publishActivity: (
      tenantContext: string,
      centerId: string,
      activityId: string,
      signal?: AbortSignal,
    ) =>
      request<void>(
        `${activityPath(centerId)}/${encodeURIComponent(activityId)}/publish`,
        { method: 'PATCH', context: tenantContext, signal },
      ),
    disableActivity: (
      tenantContext: string,
      centerId: string,
      activityId: string,
      signal?: AbortSignal,
    ) =>
      request<void>(
        `${activityPath(centerId)}/${encodeURIComponent(activityId)}/disable`,
        { method: 'PATCH', context: tenantContext, signal },
      ),
    listSlots: (
      tenantContext: string,
      centerId: string,
      activityId: string,
      query: CatalogSlotListQuery = {},
      signal?: AbortSignal,
    ) =>
      request<CatalogSlotList>(
        withListQuery(slotsPath(centerId, activityId), query),
        { context: tenantContext, signal },
      ),
    createSlot: (
      tenantContext: string,
      centerId: string,
      activityId: string,
      input: CreateCatalogSlotInput,
      signal?: AbortSignal,
    ) =>
      request<CatalogSlot>(slotsPath(centerId, activityId), {
        method: 'POST',
        context: tenantContext,
        body: slotInputBody(input),
        signal,
      }),
    closeSlot: (
      tenantContext: string,
      centerId: string,
      slotId: string,
      signal?: AbortSignal,
    ) =>
      request<void>(
        `/v1/centers/${encodeURIComponent(centerId)}/slots/${encodeURIComponent(slotId)}/close`,
        { method: 'PATCH', context: tenantContext, signal },
      ),
    cancelSlot: (
      tenantContext: string,
      centerId: string,
      slotId: string,
      signal?: AbortSignal,
    ) =>
      request<void>(
        `/v1/centers/${encodeURIComponent(centerId)}/slots/${encodeURIComponent(slotId)}/cancel`,
        { method: 'PATCH', context: tenantContext, signal },
      ),
  };
}
