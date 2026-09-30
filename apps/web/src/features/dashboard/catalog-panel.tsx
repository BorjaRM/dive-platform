'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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

export function CatalogPanel() {
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
    />
  );
}

function CatalogCenterPanel({
  centerId,
  navigation,
}: {
  centerId: string;
  navigation: ReturnType<typeof useCatalogNavigation>;
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
    selectedActivityId,
    activityStatus,
    slotStatus,
    activityPage,
    slotPage,
    updateSearchParams,
  } = navigation;
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: [...CATALOG_QUERY_KEYS.settings, tenantContext, centerId],
    queryFn: ({ signal }) =>
      api.getCatalogSettings(tenantContext as string, centerId, signal),
    enabled: isReady && Boolean(tenantContext && centerId),
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
    enabled: isReady && Boolean(tenantContext && centerId),
    retry: false,
  });

  const activities = activitiesQuery.data?.items ?? [];
  const selectedActivity =
    activities.find((activity) => activity.id === selectedActivityId) ??
    activities[0] ??
    null;
  const effectiveActivityId = selectedActivity?.id ?? null;

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
    if (!activitiesQuery.isSuccess) return;
    if (effectiveActivityId === selectedActivityId) return;
    updateSearchParams({
      [CATALOG_SEARCH_PARAMS.activityId]: effectiveActivityId,
      [CATALOG_SEARCH_PARAMS.slotPage]: null,
    });
  }, [
    authorizedCenters.length,
    centerId,
    requestedCenterId,
    activitiesQuery.isSuccess,
    effectiveActivityId,
    selectedActivityId,
    updateSearchParams,
  ]);

  const effectiveSlotPage =
    effectiveActivityId === selectedActivityId ? slotPage : 1;

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
      activitiesQuery.isSuccess &&
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
      onSuccess: () => {
        switch (action.type) {
          case 'select-language':
            updateSearchParams({});
            break;
          case 'create-activity':
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
    <section className="catalog-page" aria-labelledby="catalog-heading">
      <div className="catalog-frame">
        <header className="catalog-header">
          <div>
            <p className="section-kicker">US-08 · Catalog</p>
            <h2 id="catalog-heading">Activities and availability</h2>
            <p>
              Manage the published experiences and their bookable time slots for
              one authorized center.
            </p>
          </div>
          <label className="catalog-control">
            <span>Center</span>
            <select
              value={centerId}
              disabled={catalogMutation.isPending}
              onChange={(event) => {
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
            </select>
          </label>
        </header>

        {authorizedCenters.length === 0 ? (
          <CatalogNotice
            title="No center is available"
            message="The current tenant context has no server-authorized center for catalog management."
          />
        ) : (
          <>
            <div className="catalog-grid">
              <ActivitiesSection
                query={activitiesQuery}
                selectedActivityId={effectiveActivityId}
                status={activityStatus}
                page={activityPage}
                isUpdating={activityMutationPending}
                isBusy={catalogMutation.isPending}
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
                  updateSearchParams({
                    [CATALOG_SEARCH_PARAMS.activityId]: activityId,
                    [CATALOG_SEARCH_PARAMS.slotPage]: null,
                  })
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
            </div>

            {selectedActivity && (
              <ActivitySlotsSection
                activity={selectedActivity}
                query={slotsQuery}
                status={slotStatus}
                page={effectiveSlotPage}
                isUpdating={slotMutationPending}
                isBusy={catalogMutation.isPending}
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
                <CreateSlotForm
                  key={selectedActivity.id}
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
              </ActivitySlotsSection>
            )}
          </>
        )}
        {(successNotice || mutationError) && (
          <div className="catalog-feedback" role="status" aria-live="polite">
            {successNotice ?? describeCatalogError(mutationError)}
          </div>
        )}
      </div>
    </section>
  );
}

function isSessionExpired(error: unknown) {
  return error instanceof DashboardApiError && error.kind === 'session-expired';
}
