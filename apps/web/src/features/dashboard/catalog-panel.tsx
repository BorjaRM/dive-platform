'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Notice, Select } from '../../components/ui/controls';
import styles from './catalog.module.css';
import { EditCatalogActivity } from './catalog-activity-edit';
import type {
  CatalogLocale,
  CreateCatalogActivityInput,
  CreateCatalogSlotInput,
} from './catalog-api';
import { CatalogNotice, describeCatalogError } from './catalog-feedback';
import { CatalogActivityEditor, CreateSlotForm } from './catalog-forms';
import { ActivitiesSection, ActivitySlotsSection } from './catalog-sections';
import { useDashboardContext } from './dashboard-context';
import { DashboardApiError } from './tenant-context';
import {
  CATALOG_SEARCH_PARAMS,
  useCatalogNavigation,
} from './use-catalog-navigation';

const CATALOG_QUERY_KEYS = {
  root: ['dashboard', 'catalog'] as const,
  activities: ['dashboard', 'catalog', 'activities'] as const,
  slots: ['dashboard', 'catalog', 'slots'] as const,
  settings: ['dashboard', 'catalog', 'settings'] as const,
};

const PAGE_SIZE = 10;

const CATALOG_VIEW_TITLES = {
  list: 'Activities',
  create: 'New activity',
  edit: 'Edit activity',
};

type CatalogMutation =
  | { type: 'select-language'; locale: CatalogLocale }
  | { type: 'create-activity'; input: CreateCatalogActivityInput }
  | {
      type: 'activity-command';
      command: 'publish' | 'disable';
      activityId: string;
    }
  | {
      type: 'create-slot';
      activityId: string;
      input: CreateCatalogSlotInput;
    }
  | {
      type: 'slot-command';
      command: 'close' | 'cancel';
      slotId: string;
    };

export type CatalogView =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; activityId: string };

export function CatalogPanel({
  view = { kind: 'list' },
}: {
  view?: CatalogView;
}) {
  const { authorizedCenters, isReady, tenantContext } = useDashboardContext();
  const navigation = useCatalogNavigation();
  const centerId = authorizedCenters.some(
    (center) => center.id === navigation.requestedCenterId,
  )
    ? navigation.requestedCenterId
    : (authorizedCenters[0]?.id ?? '');
  if (!isReady) return null;
  return (
    <CatalogCenterPanel
      key={`${tenantContext}:${centerId}`}
      centerId={centerId}
      navigation={navigation}
      view={view}
    />
  );
}

function CatalogCenterPanel({
  centerId,
  navigation,
  view,
}: {
  centerId: string;
  navigation: ReturnType<typeof useCatalogNavigation>;
  view: CatalogView;
}) {
  const {
    api,
    authorizedCenters,
    handleSessionExpired,
    isReady,
    tenantContext,
  } = useDashboardContext();
  const queryClient = useQueryClient();
  const {
    requestedCenterId,
    activityStatus,
    slotStatus,
    activityPage,
    slotPage,
    updateSearchParams,
    navigate,
  } = navigation;
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const timeZone =
    authorizedCenters.find((center) => center.id === centerId)?.timeZone ??
    null;
  const capabilitiesQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_KEYS.root,
      'capabilities',
      tenantContext,
      centerId,
    ],
    queryFn: ({ signal }) =>
      api.getDashboardCapabilities(tenantContext as string, centerId, signal),
    enabled: isReady && Boolean(tenantContext && centerId),
    retry: false,
  });
  const capabilities =
    capabilitiesQuery.isSuccess && !capabilitiesQuery.isFetching
      ? capabilitiesQuery.data
      : undefined;

  const settingsQuery = useQuery({
    queryKey: [...CATALOG_QUERY_KEYS.settings, tenantContext, centerId],
    queryFn: ({ signal }) =>
      api.getCatalogSettings(tenantContext as string, centerId, signal),
    enabled:
      view.kind === 'create' && isReady && Boolean(tenantContext && centerId),
    retry: false,
  });

  const activitiesQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_KEYS.activities,
      tenantContext,
      centerId,
      activityPage,
      activityStatus,
    ],
    queryFn: ({ signal }) =>
      api.listActivities(
        tenantContext as string,
        centerId,
        {
          page: activityPage,
          pageSize: PAGE_SIZE,
          ...(activityStatus ? { status: activityStatus } : {}),
        },
        signal,
      ),
    enabled:
      view.kind === 'list' && isReady && Boolean(tenantContext && centerId),
    retry: false,
  });

  const activityId = view.kind === 'edit' ? view.activityId : null;
  const activityQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_KEYS.activities,
      tenantContext,
      centerId,
      activityId,
    ],
    queryFn: ({ signal }) =>
      api.getActivity(
        tenantContext as string,
        centerId,
        activityId as string,
        signal,
      ),
    enabled:
      view.kind === 'edit' &&
      isReady &&
      centerId === requestedCenterId &&
      Boolean(tenantContext && centerId),
    gcTime: 0,
    retry: false,
  });
  const selectedActivity = activityQuery.data?.activity ?? null;
  const effectiveActivityId = activityId;

  useEffect(() => {
    if (authorizedCenters.length === 0) return;
    if (centerId !== requestedCenterId) {
      updateSearchParams({
        [CATALOG_SEARCH_PARAMS.centerId]: centerId,
        [CATALOG_SEARCH_PARAMS.activityId]: null,
        [CATALOG_SEARCH_PARAMS.activityPage]: null,
        [CATALOG_SEARCH_PARAMS.slotPage]: null,
      });
      return;
    }
  }, [
    authorizedCenters.length,
    centerId,
    requestedCenterId,
    updateSearchParams,
  ]);

  const effectiveSlotPage = slotPage;

  const slotsQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_KEYS.slots,
      tenantContext,
      centerId,
      effectiveActivityId,
      effectiveSlotPage,
      slotStatus,
    ],
    queryFn: ({ signal }) =>
      api.listSlots(
        tenantContext as string,
        centerId,
        effectiveActivityId as string,
        {
          page: effectiveSlotPage,
          pageSize: PAGE_SIZE,
          ...(slotStatus ? { status: slotStatus } : {}),
        },
        signal,
      ),
    enabled:
      isReady &&
      view.kind === 'edit' &&
      activityQuery.isSuccess &&
      centerId === requestedCenterId &&
      Boolean(tenantContext && centerId && effectiveActivityId),
    retry: false,
  });

  const catalogMutation = useMutation({
    mutationFn: async (action: CatalogMutation) => {
      if (!tenantContext || !centerId) {
        throw new Error('A server-authorized center is required.');
      }
      switch (action.type) {
        case 'select-language':
          return api.selectCatalogLanguage(
            tenantContext,
            centerId,
            action.locale,
          );
        case 'create-activity':
          return api.createActivity(tenantContext, centerId, action.input);
        case 'activity-command':
          return action.command === 'publish'
            ? api.publishActivity(tenantContext, centerId, action.activityId)
            : api.disableActivity(tenantContext, centerId, action.activityId);
        case 'create-slot':
          return api.createSlot(
            tenantContext,
            centerId,
            action.activityId,
            action.input,
          );
        case 'slot-command':
          return action.command === 'close'
            ? api.closeSlot(tenantContext, centerId, action.slotId)
            : api.cancelSlot(tenantContext, centerId, action.slotId);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.root });
    },
    onError: (error) => {
      if (isSessionExpired(error)) handleSessionExpired();
      if (
        error instanceof DashboardApiError &&
        error.problem?.code === 'center_catalog_locale_locked'
      ) {
        void queryClient.invalidateQueries({
          queryKey: CATALOG_QUERY_KEYS.settings,
        });
      }
    },
  });

  const querySessionExpired = [
    settingsQuery.error,
    activitiesQuery.error,
    slotsQuery.error,
    activityQuery.error,
  ].some(isSessionExpired);
  useEffect(() => {
    if (querySessionExpired) handleSessionExpired();
  }, [querySessionExpired, handleSessionExpired]);

  if (!isReady) return null;

  const runMutation = (
    action: CatalogMutation,
    message: string,
    onSuccess?: () => void,
  ) => {
    setSuccessNotice(null);
    catalogMutation.mutate(action, {
      onSuccess: (result) => {
        switch (action.type) {
          case 'select-language':
            updateSearchParams({});
            break;
          case 'create-activity':
            if (result && 'id' in result) {
              navigate(
                `/dashboard/activities/${encodeURIComponent(result.id)}/edit`,
                { [CATALOG_SEARCH_PARAMS.centerId]: centerId },
              );
            }
            break;
          case 'activity-command':
            updateSearchParams({ [CATALOG_SEARCH_PARAMS.activityPage]: null });
            break;
          case 'create-slot':
          case 'slot-command':
            updateSearchParams({ [CATALOG_SEARCH_PARAMS.slotPage]: null });
            break;
        }
        setSuccessNotice(message);
        onSuccess?.();
      },
    });
  };

  const mutationError = catalogMutation.error;
  const pendingMutationType = catalogMutation.isPending
    ? catalogMutation.variables?.type
    : undefined;
  const activityMutationPending =
    pendingMutationType === 'create-activity' ||
    pendingMutationType === 'activity-command';
  const slotMutationPending =
    pendingMutationType === 'create-slot' ||
    pendingMutationType === 'slot-command';

  return (
    <section className={styles.page} aria-label="Activity catalog">
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.sectionKicker}>Catalog</p>
            <h2 id="catalog-heading">{CATALOG_VIEW_TITLES[view.kind]}</h2>
            <div className={styles.navigation}>
              {view.kind !== 'list' && (
                <Button
                  variant="secondary"
                  onClick={() => navigate('/dashboard/activities')}
                >
                  Back to activities
                </Button>
              )}
              {view.kind === 'list' && (
                <Button
                  variant="secondary"
                  onClick={() => navigate('/dashboard')}
                >
                  Home
                </Button>
              )}
              {view.kind === 'list' && (
                <Button
                  variant="secondary"
                  onClick={() => navigate('/dashboard/calendar')}
                >
                  Calendar
                </Button>
              )}
              {view.kind === 'list' && capabilities?.canCreateActivity && (
                <Button
                  onClick={() =>
                    navigate('/dashboard/activities/new', {
                      [CATALOG_SEARCH_PARAMS.centerId]: centerId,
                    })
                  }
                >
                  Create activity
                </Button>
              )}
            </div>
          </div>
          <label className={styles.control} htmlFor="catalog-center">
            <span>Center</span>
            <Select
              id="catalog-center"
              value={centerId}
              disabled={catalogMutation.isPending}
              onChange={(event) => {
                if (view.kind === 'edit') {
                  navigate('/dashboard/activities', {
                    [CATALOG_SEARCH_PARAMS.centerId]: event.target.value,
                    [CATALOG_SEARCH_PARAMS.activityPage]: null,
                  });
                  return;
                }
                updateSearchParams({
                  [CATALOG_SEARCH_PARAMS.centerId]: event.target.value,
                  [CATALOG_SEARCH_PARAMS.activityId]: null,
                  [CATALOG_SEARCH_PARAMS.activityPage]: null,
                  [CATALOG_SEARCH_PARAMS.slotPage]: null,
                });
              }}
            >
              {authorizedCenters.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </Select>
          </label>
        </header>

        {authorizedCenters.length === 0 ? (
          <CatalogNotice
            title="No center is available"
            message="The current tenant context has no server-authorized center for catalog management."
          />
        ) : (
          <>
            {view.kind === 'list' && (
              <ActivitiesSection
                query={activitiesQuery}
                selectedActivityId={null}
                status={activityStatus}
                page={activityPage}
                isUpdating={activityMutationPending}
                isBusy={catalogMutation.isPending}
                canPublishActivity={capabilities?.canPublishActivity === true}
                onStatusChange={(status) =>
                  updateSearchParams({
                    [CATALOG_SEARCH_PARAMS.activityStatus]: status,
                    [CATALOG_SEARCH_PARAMS.activityPage]: null,
                  })
                }
                onPageChange={(page) =>
                  updateSearchParams({
                    [CATALOG_SEARCH_PARAMS.activityPage]:
                      page > 1 ? page : null,
                  })
                }
                onSelect={(activityId) =>
                  navigate(
                    `/dashboard/activities/${encodeURIComponent(activityId)}/edit`,
                    { [CATALOG_SEARCH_PARAMS.centerId]: centerId },
                  )
                }
                onCommand={(activityId, command) =>
                  runMutation(
                    { type: 'activity-command', command, activityId },
                    command === 'publish'
                      ? 'Activity published.'
                      : 'Activity disabled.',
                  )
                }
              />
            )}
            {view.kind === 'create' && (
              <CatalogActivityEditor
                settings={settingsQuery}
                isBusy={catalogMutation.isPending}
                onSelectLanguage={(locale) =>
                  runMutation(
                    { type: 'select-language', locale },
                    'Catalog language saved.',
                  )
                }
                onInvalid={() => setSuccessNotice(null)}
                onCreate={(input, onSuccess) =>
                  runMutation(
                    { type: 'create-activity', input },
                    'Activity created.',
                    onSuccess,
                  )
                }
              />
            )}

            {view.kind === 'edit' && (
              <>
                {activityQuery.isPending && (
                  <CatalogNotice title="Loading activity" />
                )}
                {activityQuery.error && (
                  <CatalogNotice
                    title="Activity could not be loaded"
                    message={describeCatalogError(activityQuery.error)}
                  />
                )}
                {activityQuery.data && (
                  <EditCatalogActivity
                    key={activityId}
                    detail={activityQuery.data}
                    centerId={centerId}
                    canEditActivity={capabilities?.canUpdateActivity === true}
                    onReload={async () => {
                      const result = await activityQuery.refetch();
                      if (result.error) throw result.error;
                      return result.data ?? null;
                    }}
                  />
                )}
              </>
            )}

            {view.kind === 'edit' && selectedActivity && (
              <ActivitySlotsSection
                activity={selectedActivity}
                timeZone={timeZone}
                query={slotsQuery}
                status={slotStatus}
                page={effectiveSlotPage}
                isUpdating={slotMutationPending}
                isBusy={catalogMutation.isPending}
                canManageSlots={capabilities?.canScheduleSession === true}
                onStatusChange={(status) =>
                  updateSearchParams({
                    [CATALOG_SEARCH_PARAMS.slotStatus]: status,
                    [CATALOG_SEARCH_PARAMS.slotPage]: null,
                  })
                }
                onPageChange={(page) =>
                  updateSearchParams({
                    [CATALOG_SEARCH_PARAMS.slotPage]: page > 1 ? page : null,
                  })
                }
                onCommand={(slotId, command) =>
                  runMutation(
                    { type: 'slot-command', command, slotId },
                    command === 'close' ? 'Slot closed.' : 'Slot cancelled.',
                  )
                }
              >
                {capabilities?.canScheduleSession && (
                  <CreateSlotForm
                    key={selectedActivity.id}
                    timeZone={timeZone}
                    disabled={catalogMutation.isPending}
                    onInvalid={() => setSuccessNotice(null)}
                    onCreate={(input, onSuccess) => {
                      runMutation(
                        {
                          type: 'create-slot',
                          activityId: selectedActivity.id,
                          input,
                        },
                        'Slot created.',
                        onSuccess,
                      );
                    }}
                  />
                )}
              </ActivitySlotsSection>
            )}
          </>
        )}
        {(successNotice || mutationError) && (
          <Notice
            variant="inline"
            tone="success"
            role="status"
            aria-live="polite"
          >
            {successNotice ?? describeCatalogError(mutationError)}
          </Notice>
        )}
      </div>
    </section>
  );
}

function isSessionExpired(error: unknown) {
  return error instanceof DashboardApiError && error.kind === 'session-expired';
}
