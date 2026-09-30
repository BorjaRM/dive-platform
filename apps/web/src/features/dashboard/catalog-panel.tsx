'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseFormRegisterReturn, useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  ActivityStatus,
  CatalogActivity,
  CatalogLocale,
  CatalogSlot,
  CreateCatalogActivityInput,
  CreateCatalogSlotInput,
  LocalizedText,
  SlotStatus,
} from './catalog-api';
import { useDashboardContext } from './dashboard-context';
import { DashboardApiError } from './tenant-context';

const CATALOG_QUERY_KEYS = {
  root: ['dashboard', 'catalog'] as const,
  activities: ['dashboard', 'catalog', 'activities'] as const,
  slots: ['dashboard', 'catalog', 'slots'] as const,
  settings: ['dashboard', 'catalog', 'settings'] as const,
};

const PAGE_SIZE = 10;
const CATALOG_SEARCH_PARAMS = {
  activityId: 'activity',
  activityPage: 'activityPage',
  activityStatus: 'activityStatus',
  centerId: 'center',
  slotPage: 'slotPage',
  slotStatus: 'slotStatus',
} as const;

type ActivityStatusFilter = ActivityStatus | '';
type SlotStatusFilter = SlotStatus | '';

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

function useCatalogNavigation() {
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

  return { searchParams, updateSearchParams };
}

const activityFormSchema = z.object({
  nameEs: z.string(),
  nameEn: z.string(),
  descriptionEs: z.string(),
  descriptionEn: z.string(),
  defaultCapacity: z
    .string()
    .refine(
      (value) => !value.trim() || validPositiveInteger(value),
      'Default capacity must be a positive whole number.',
    ),
});

const slotFormSchema = z.object({
  startsAt: z
    .string()
    .trim()
    .min(1, 'Add an RFC3339 start instant, including its offset.'),
  durationMinutes: z
    .string()
    .refine(
      validPositiveInteger,
      'Duration and capacity must be positive whole numbers.',
    ),
  capacity: z
    .string()
    .refine(
      validPositiveInteger,
      'Duration and capacity must be positive whole numbers.',
    ),
});

type ActivityFormValues = z.infer<typeof activityFormSchema>;
type SlotFormValues = z.infer<typeof slotFormSchema>;

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
  const {
    api,
    authorizedCenters,
    handleSessionExpired,
    isReady,
    tenantContext,
  } = useDashboardContext();
  const queryClient = useQueryClient();
  const { searchParams, updateSearchParams } = useCatalogNavigation();
  const requestedCenterId =
    searchParams.get(CATALOG_SEARCH_PARAMS.centerId) ?? '';
  const centerId = authorizedCenters.some(
    (center) => center.id === requestedCenterId,
  )
    ? requestedCenterId
    : (authorizedCenters[0]?.id ?? '');
  const selectedActivityId = searchParams.get(CATALOG_SEARCH_PARAMS.activityId);
  const activityStatus = parseActivityStatus(
    searchParams.get(CATALOG_SEARCH_PARAMS.activityStatus),
  );
  const slotStatus = parseSlotStatus(
    searchParams.get(CATALOG_SEARCH_PARAMS.slotStatus),
  );
  const activityPage = parsePage(
    searchParams.get(CATALOG_SEARCH_PARAMS.activityPage),
  );
  const slotPage = parsePage(searchParams.get(CATALOG_SEARCH_PARAMS.slotPage));
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const activityForm = useForm<ActivityFormValues>({
    defaultValues: {
      nameEs: '',
      nameEn: '',
      descriptionEs: '',
      descriptionEn: '',
      defaultCapacity: '',
    },
    resolver: zodResolver(activityFormSchema),
  });
  const slotForm = useForm<SlotFormValues>({
    defaultValues: {
      startsAt: '',
      durationMinutes: '60',
      capacity: '8',
    },
    resolver: zodResolver(slotFormSchema),
  });

  useEffect(() => {
    if (authorizedCenters.length === 0 || centerId === requestedCenterId)
      return;
    updateSearchParams({
      [CATALOG_SEARCH_PARAMS.centerId]: centerId,
      [CATALOG_SEARCH_PARAMS.activityId]: null,
      [CATALOG_SEARCH_PARAMS.activityPage]: null,
      [CATALOG_SEARCH_PARAMS.slotPage]: null,
    });
  }, [
    authorizedCenters.length,
    centerId,
    requestedCenterId,
    updateSearchParams,
  ]);

  const settingsQuery = useQuery({
    queryKey: [...CATALOG_QUERY_KEYS.settings, tenantContext, centerId],
    queryFn: ({ signal }) =>
      api.getCatalogSettings(tenantContext as string, centerId, signal),
    enabled: isReady && Boolean(tenantContext && centerId),
    retry: false,
  });
  const baseLocale = settingsQuery.data?.defaultActivityLocale ?? null;
  const activityDraftScope = useRef({ centerId, tenantContext });

  useEffect(() => {
    const previousScope = activityDraftScope.current;
    if (
      previousScope.centerId === centerId &&
      previousScope.tenantContext === tenantContext
    )
      return;
    activityDraftScope.current = { centerId, tenantContext };
    activityForm.reset();
    setSuccessNotice(null);
  }, [centerId, tenantContext, activityForm.reset]);

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

  useEffect(() => {
    const activities = activitiesQuery.data?.items ?? [];
    const nextActivityId =
      activities.find((activity) => activity.id === selectedActivityId)?.id ??
      activities[0]?.id ??
      null;
    if (nextActivityId !== selectedActivityId) {
      updateSearchParams({
        [CATALOG_SEARCH_PARAMS.activityId]: nextActivityId,
        [CATALOG_SEARCH_PARAMS.slotPage]: null,
      });
    }
  }, [activitiesQuery.data, selectedActivityId, updateSearchParams]);

  const selectedActivity =
    activitiesQuery.data?.items.find(
      (activity) => activity.id === selectedActivityId,
    ) ?? null;

  const slotsQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_KEYS.slots,
      tenantContext,
      centerId,
      selectedActivityId,
      slotPage,
      slotStatus,
    ],
    queryFn: ({ signal }) =>
      api.listSlots(
        tenantContext as string,
        centerId,
        selectedActivityId as string,
        {
          page: slotPage,
          pageSize: PAGE_SIZE,
          ...(slotStatus ? { status: slotStatus } : {}),
        },
        signal,
      ),
    enabled:
      isReady && Boolean(tenantContext && centerId && selectedActivityId),
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

  useEffect(() => {
    if (isSessionExpired(settingsQuery.error)) handleSessionExpired();
  }, [settingsQuery.error, handleSessionExpired]);

  useEffect(() => {
    if (isSessionExpired(catalogMutation.error)) handleSessionExpired();
  }, [catalogMutation.error, handleSessionExpired]);

  useEffect(() => {
    if (isSessionExpired(activitiesQuery.error)) handleSessionExpired();
  }, [activitiesQuery.error, handleSessionExpired]);

  useEffect(() => {
    if (isSessionExpired(slotsQuery.error)) handleSessionExpired();
  }, [handleSessionExpired, slotsQuery.error]);

  if (!isReady) return null;

  const runMutation = (
    action: CatalogMutation,
    message: string,
    onSuccess?: () => void,
  ) => {
    setSuccessNotice(null);
    catalogMutation.mutate(action, {
      onSuccess: () => {
        updateSearchParams(
          action.type === 'select-language'
            ? {}
            : action.type === 'create-activity' ||
                action.type === 'activity-command'
              ? { [CATALOG_SEARCH_PARAMS.activityPage]: null }
              : { [CATALOG_SEARCH_PARAMS.slotPage]: null },
        );
        setSuccessNotice(message);
        onSuccess?.();
      },
    });
  };

  const submitActivity = (values: ActivityFormValues) => {
    if (!baseLocale || settingsQuery.isError || settingsQuery.isPending) return;
    const requiredField = baseLocale === 'es' ? 'nameEs' : 'nameEn';
    if (!values[requiredField].trim()) {
      activityForm.setError(
        requiredField,
        {
          message: `Add the activity name in ${baseLocale === 'es' ? 'Spanish' : 'English'}.`,
        },
        { shouldFocus: true },
      );
      return;
    }
    const name = localizedValue(values.nameEs, values.nameEn);
    const description = localizedValue(
      values.descriptionEs,
      values.descriptionEn,
    );
    runMutation(
      {
        type: 'create-activity',
        input: {
          name,
          ...(Object.keys(description).length > 0 ? { description } : {}),
          ...(values.defaultCapacity.trim()
            ? { defaultCapacity: Number(values.defaultCapacity) }
            : {}),
        },
      },
      'Activity created.',
      () => {
        activityForm.reset();
        updateSearchParams({ [CATALOG_SEARCH_PARAMS.activityPage]: null });
      },
    );
  };

  const submitSlot = (values: SlotFormValues) => {
    if (!selectedActivityId) return;
    runMutation(
      {
        type: 'create-slot',
        activityId: selectedActivityId,
        input: {
          startsAt: values.startsAt.trim(),
          durationMinutes: Number(values.durationMinutes),
          capacity: Number(values.capacity),
        },
      },
      'Slot created.',
      () => {
        slotForm.reset();
        updateSearchParams({ [CATALOG_SEARCH_PARAMS.slotPage]: null });
      },
    );
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
  const activityItems = activitiesQuery.data?.items ?? [];
  const slotItems = slotsQuery.data?.items ?? [];

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
              <section
                className="catalog-section"
                aria-labelledby="activities-heading"
              >
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Catalog</p>
                    <h3 id="activities-heading">Activities</h3>
                  </div>
                  <span className="context-badge">
                    {activitiesQuery.data?.items.length ?? 0} shown
                  </span>
                </div>
                {activityMutationPending && (
                  <CatalogNotice
                    title="Updating activities"
                    message="Saving the latest activity change."
                  />
                )}
                <label className="catalog-filter">
                  <span>Status</span>
                  <select
                    value={activityStatus}
                    onChange={(event) => {
                      updateSearchParams({
                        [CATALOG_SEARCH_PARAMS.activityStatus]:
                          event.target.value,
                        [CATALOG_SEARCH_PARAMS.activityPage]: null,
                      });
                    }}
                  >
                    <option value="">All statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </label>
                {activitiesQuery.isPending && (
                  <CatalogNotice title="Loading activities" />
                )}
                {activitiesQuery.error && (
                  <CatalogNotice
                    title="Activities could not be loaded"
                    message={describeError(activitiesQuery.error)}
                  />
                )}
                {!activitiesQuery.isPending &&
                  !activitiesQuery.error &&
                  activityItems.length === 0 && (
                    <CatalogNotice
                      title="No activities yet"
                      message="Create the first activity for this center to start adding availability."
                    />
                  )}
                <ul className="catalog-list">
                  {activityItems.map((activity) => (
                    <ActivityRow
                      key={activity.id}
                      activity={activity}
                      isSelected={activity.id === selectedActivityId}
                      isBusy={catalogMutation.isPending}
                      onSelect={() => {
                        updateSearchParams({
                          [CATALOG_SEARCH_PARAMS.activityId]: activity.id,
                          [CATALOG_SEARCH_PARAMS.slotPage]: null,
                        });
                      }}
                      onCommand={(command) =>
                        runMutation(
                          {
                            type: 'activity-command',
                            command,
                            activityId: activity.id,
                          },
                          command === 'publish'
                            ? 'Activity published.'
                            : 'Activity disabled.',
                        )
                      }
                    />
                  ))}
                </ul>
                <Pagination
                  page={activityPage}
                  hasNext={activitiesQuery.data?.hasNext ?? false}
                  onPrevious={() =>
                    updateSearchParams({
                      [CATALOG_SEARCH_PARAMS.activityPage]:
                        activityPage > 2 ? activityPage - 1 : null,
                    })
                  }
                  onNext={() =>
                    updateSearchParams({
                      [CATALOG_SEARCH_PARAMS.activityPage]: activityPage + 1,
                    })
                  }
                />
              </section>

              <section
                className="catalog-section catalog-editor"
                aria-labelledby="activity-form-heading"
              >
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">New record</p>
                    <h3 id="activity-form-heading">Create activity</h3>
                  </div>
                </div>
                {settingsQuery.isPending && (
                  <CatalogNotice title="Loading catalog language" />
                )}
                {settingsQuery.error && (
                  <CatalogNotice
                    title="Catalog language unavailable"
                    message={describeError(settingsQuery.error)}
                  />
                )}
                {baseLocale && (
                  <p className="field-hint">
                    Catalog language:{' '}
                    {baseLocale === 'es' ? 'Spanish' : 'English'}
                  </p>
                )}
                {settingsQuery.isSuccess && !baseLocale && (
                  <form
                    className="catalog-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const locale = new FormData(event.currentTarget).get(
                        'catalogLocale',
                      );
                      if (locale === 'es' || locale === 'en') {
                        runMutation(
                          { type: 'select-language', locale },
                          'Catalog language saved.',
                        );
                      }
                    }}
                  >
                    <label className="catalog-field">
                      <span>Catalog language</span>
                      <select
                        key={`${tenantContext}:${centerId}`}
                        name="catalogLocale"
                        required
                        defaultValue=""
                        disabled={catalogMutation.isPending}
                      >
                        <option value="" disabled>
                          Select language
                        </option>
                        <option value="es">Spanish</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="catalog-primary-action"
                      disabled={catalogMutation.isPending}
                    >
                      Save catalog language
                    </button>
                  </form>
                )}
                <form
                  className="catalog-form"
                  onSubmit={activityForm.handleSubmit(submitActivity, () => {
                    setSuccessNotice(null);
                  })}
                >
                  <fieldset
                    className="catalog-form"
                    style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
                    disabled={
                      !baseLocale ||
                      settingsQuery.isError ||
                      settingsQuery.isPending ||
                      catalogMutation.isPending
                    }
                  >
                    <div className="form-field-grid">
                      <Field
                        id="activity-name-es"
                        label="Name · ES"
                        required={baseLocale === 'es'}
                        registration={activityForm.register('nameEs')}
                        error={activityForm.formState.errors.nameEs?.message}
                      />
                      <Field
                        id="activity-name-en"
                        label="Name · EN"
                        required={baseLocale === 'en'}
                        registration={activityForm.register('nameEn')}
                        error={activityForm.formState.errors.nameEn?.message}
                      />
                    </div>
                    <div className="form-field-grid">
                      <Field
                        id="activity-description-es"
                        label="Description · ES"
                        registration={activityForm.register('descriptionEs')}
                        error={
                          activityForm.formState.errors.descriptionEs?.message
                        }
                      />
                      <Field
                        id="activity-description-en"
                        label="Description · EN"
                        registration={activityForm.register('descriptionEn')}
                        error={
                          activityForm.formState.errors.descriptionEn?.message
                        }
                      />
                    </div>
                    <Field
                      id="activity-capacity"
                      label="Default capacity"
                      type="number"
                      min="1"
                      registration={activityForm.register('defaultCapacity')}
                      error={
                        activityForm.formState.errors.defaultCapacity?.message
                      }
                    />
                    <button
                      className="catalog-primary-action"
                      type="submit"
                      disabled={
                        !baseLocale ||
                        settingsQuery.isError ||
                        settingsQuery.isPending ||
                        catalogMutation.isPending
                      }
                    >
                      Create activity
                    </button>
                  </fieldset>
                </form>
              </section>
            </div>

            {selectedActivity && (
              <section
                className="catalog-section slots-section"
                aria-labelledby="slots-heading"
              >
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Activity availability</p>
                    <h3 id="slots-heading">
                      Slots for{' '}
                      {localizedText(
                        selectedActivity.name,
                        selectedActivity.baseLocale,
                      )}
                    </h3>
                  </div>
                  <span className="context-badge">
                    {selectedActivity.status}
                  </span>
                </div>
                <div className="slot-toolbar">
                  {slotMutationPending && (
                    <CatalogNotice
                      title="Updating slots"
                      message="Saving the latest slot change."
                    />
                  )}
                  <label className="catalog-filter">
                    <span>Status</span>
                    <select
                      value={slotStatus}
                      onChange={(event) => {
                        updateSearchParams({
                          [CATALOG_SEARCH_PARAMS.slotStatus]:
                            event.target.value,
                          [CATALOG_SEARCH_PARAMS.slotPage]: null,
                        });
                      }}
                    >
                      <option value="">All statuses</option>
                      <option value="Available">Available</option>
                      <option value="Full">Full</option>
                      <option value="Closed">Closed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </label>
                  <span className="field-hint">
                    Starts at accepts an RFC3339 instant such as
                    2026-10-01T10:00:00Z.
                  </span>
                </div>
                {slotsQuery.isPending && (
                  <CatalogNotice title="Loading slots" />
                )}
                {slotsQuery.error && (
                  <CatalogNotice
                    title="Slots could not be loaded"
                    message={describeError(slotsQuery.error)}
                  />
                )}
                {!slotsQuery.isPending &&
                  !slotsQuery.error &&
                  slotItems.length === 0 && (
                    <CatalogNotice
                      title="No slots yet"
                      message="Add a slot after the activity is published."
                    />
                  )}
                <ul className="catalog-list slot-list">
                  {slotItems.map((slot) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      isBusy={catalogMutation.isPending}
                      onCommand={(command) =>
                        runMutation(
                          { type: 'slot-command', command, slotId: slot.id },
                          command === 'close'
                            ? 'Slot closed.'
                            : 'Slot cancelled.',
                        )
                      }
                    />
                  ))}
                </ul>
                <Pagination
                  page={slotPage}
                  hasNext={slotsQuery.data?.hasNext ?? false}
                  onPrevious={() =>
                    updateSearchParams({
                      [CATALOG_SEARCH_PARAMS.slotPage]:
                        slotPage > 2 ? slotPage - 1 : null,
                    })
                  }
                  onNext={() =>
                    updateSearchParams({
                      [CATALOG_SEARCH_PARAMS.slotPage]: slotPage + 1,
                    })
                  }
                />

                <form
                  className="slot-form"
                  onSubmit={slotForm.handleSubmit(submitSlot, () => {
                    setSuccessNotice(null);
                  })}
                >
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">New availability</p>
                      <h4>Create slot</h4>
                    </div>
                  </div>
                  <div className="form-field-grid form-field-grid-wide">
                    <Field
                      id="slot-starts-at"
                      label="Starts at · RFC3339"
                      placeholder="2026-10-01T10:00:00Z"
                      registration={slotForm.register('startsAt')}
                      error={slotForm.formState.errors.startsAt?.message}
                    />
                    <Field
                      id="slot-duration"
                      label="Duration · minutes"
                      type="number"
                      min="1"
                      registration={slotForm.register('durationMinutes')}
                      error={slotForm.formState.errors.durationMinutes?.message}
                    />
                    <Field
                      id="slot-capacity"
                      label="Capacity"
                      type="number"
                      min="1"
                      registration={slotForm.register('capacity')}
                      error={slotForm.formState.errors.capacity?.message}
                    />
                  </div>
                  <button
                    className="catalog-primary-action"
                    type="submit"
                    disabled={catalogMutation.isPending}
                  >
                    Create slot
                  </button>
                </form>
              </section>
            )}
          </>
        )}
        {(successNotice || mutationError) && (
          <div className="catalog-feedback" role="status" aria-live="polite">
            {successNotice ?? describeError(mutationError)}
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityRow({
  activity,
  isSelected,
  isBusy,
  onSelect,
  onCommand,
}: {
  activity: CatalogActivity;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onCommand: (command: 'publish' | 'disable') => void;
}) {
  return (
    <li className={`catalog-row${isSelected ? ' is-selected' : ''}`}>
      <button
        className="catalog-row-select"
        type="button"
        aria-pressed={isSelected}
        onClick={onSelect}
      >
        <span>
          <strong>{localizedText(activity.name, activity.baseLocale)}</strong>
          {activity.description &&
            localizedText(activity.description, activity.baseLocale) && (
              <small>
                {localizedText(activity.description, activity.baseLocale)}
              </small>
            )}
        </span>
        <StatusBadge status={activity.status} />
      </button>
      <div className="catalog-row-actions">
        {activity.status === 'Draft' && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('publish')}
          >
            Publish
          </button>
        )}
        {activity.status === 'Published' && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('disable')}
          >
            Disable
          </button>
        )}
      </div>
    </li>
  );
}

function SlotRow({
  slot,
  isBusy,
  onCommand,
}: {
  slot: CatalogSlot;
  isBusy: boolean;
  onCommand: (command: 'close' | 'cancel') => void;
}) {
  return (
    <li className="catalog-row">
      <div className="catalog-row-select catalog-row-static">
        <span>
          <strong>{slot.startsAt}</strong>
          <small>
            {slot.durationMinutes} min · capacity {slot.capacity}
          </small>
        </span>
        <StatusBadge status={slot.status} />
      </div>
      <div className="catalog-row-actions">
        {['Available', 'Full'].includes(slot.status) && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('close')}
          >
            Close
          </button>
        )}
        {['Available', 'Full', 'Closed'].includes(slot.status) && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('cancel')}
          >
            Cancel
          </button>
        )}
      </div>
    </li>
  );
}

function Field({
  id,
  label,
  registration,
  error,
  type = 'text',
  min,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  error: string | undefined;
  type?: 'text' | 'number';
  min?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="catalog-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        min={min}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...registration}
      />
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function Pagination({
  page,
  hasNext,
  onPrevious,
  onNext,
}: {
  page: number;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" disabled={page === 1} onClick={onPrevious}>
        Previous
      </button>
      <span>Page {page}</span>
      <button type="button" disabled={!hasNext} onClick={onNext}>
        Next
      </button>
    </nav>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}

function CatalogNotice({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="catalog-notice" role="status">
      <strong>{title}</strong>
      {message && <span>{message}</span>}
    </div>
  );
}

function localizedValue(es: string, en: string): LocalizedText {
  return {
    ...(es.trim() ? { es: es.trim() } : {}),
    ...(en.trim() ? { en: en.trim() } : {}),
  };
}

function localizedText(value: LocalizedText, baseLocale: CatalogLocale) {
  return value.en ?? value[baseLocale];
}

function validPositiveInteger(value: string) {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function describeError(error: unknown) {
  if (error instanceof DashboardApiError) {
    return error.problem?.code ?? `Request failed (${error.status}).`;
  }
  if (error instanceof Error) return error.message;
  return 'The catalog request could not be completed.';
}

function isSessionExpired(error: unknown) {
  return error instanceof DashboardApiError && error.kind === 'session-expired';
}
