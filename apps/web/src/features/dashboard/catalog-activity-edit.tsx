'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Input, Notice, Select } from '../../components/ui/controls';
import styles from './catalog.module.css';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type CatalogActivityDetail,
  type CatalogLocale,
  type LocalizedText,
  OTHER_DESCRIPTION_MAX_LENGTH,
  type UpdateCatalogActivityInput,
} from './catalog-api';
import { describeCatalogError } from './catalog-feedback';
import { StatusBadge } from './catalog-sections';
import { useDashboardContext } from './dashboard-context';
import { DashboardApiError } from './tenant-context';

const LOCALE_LABELS: Record<CatalogLocale, string> = {
  es: 'Spanish',
  en: 'English',
};

export function EditCatalogActivity({
  detail,
  centerId,
  canEditActivity,
  canDisableActivity,
  onReload,
}: {
  detail: CatalogActivityDetail;
  centerId: string;
  canEditActivity: boolean;
  canDisableActivity: boolean;
  onReload: () => Promise<CatalogActivityDetail | null>;
}) {
  const [loadedDetail, setLoadedDetail] = useState(detail);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState<Error | null>(null);
  const { activity } = loadedDetail;
  return (
    <section className={styles.section} aria-labelledby="edit-activity-heading">
      <div className={styles.sectionHeading}>
        <h3 id="edit-activity-heading">Activity details</h3>
        <StatusBadge status={activity.status} />
      </div>
      {canEditActivity ? (
        <ActivityEditForms
          key={reloadVersion}
          detail={loadedDetail}
          centerId={centerId}
          isReloading={isReloading}
          onReload={reload}
        />
      ) : (
        <ReadOnlyActivity detail={loadedDetail} />
      )}
      {reloadError && (
        <Notice role="alert">{describeCatalogError(reloadError)}</Notice>
      )}
      {canDisableActivity && activity.status === 'Published' && (
        <DisableActivityAction
          key={reloadVersion}
          activityId={activity.id}
          centerId={centerId}
          isReloading={isReloading}
          onDisabled={reload}
        />
      )}
      {canDisableActivity && activity.status === 'Disabled' && (
        <EnableActivityAction
          key={reloadVersion}
          activityId={activity.id}
          centerId={centerId}
          isReloading={isReloading}
          onEnabled={reload}
        />
      )}
    </section>
  );

  async function reload() {
    setIsReloading(true);
    setReloadError(null);
    try {
      const result = await onReload();
      if (!result)
        throw new Error(
          'Activity could not be reloaded. Your draft has been preserved.',
        );
      setLoadedDetail(result);
      setReloadVersion((version) => version + 1);
    } catch (error) {
      setReloadError(
        error instanceof Error
          ? error
          : new Error('Activity could not be reloaded.'),
      );
    } finally {
      setIsReloading(false);
    }
  }
}

function ReadOnlyActivity({ detail }: { detail: CatalogActivityDetail }) {
  const { activity } = detail;
  const base = activity.baseLocale;
  return (
    <div className={styles.form}>
      <p>
        <strong>Name</strong>: {activity.name[base] ?? 'Unnamed activity'}
      </p>
      <p>
        <strong>Description</strong>:{' '}
        {activity.description?.[base] ?? 'No description'}
      </p>
      <p>
        <strong>Default capacity</strong>:{' '}
        {activity.defaultCapacity ?? 'Not set'}
      </p>
      <p>
        <strong>Category</strong>:{' '}
        {activity.category
          ? ACTIVITY_CATEGORY_LABELS[activity.category]
          : 'Not set'}
        {activity.category === 'other' &&
          activity.otherDescription?.[base] &&
          ` · ${activity.otherDescription[base]}`}
      </p>
    </div>
  );
}

function ActivityEditForms({
  detail,
  centerId,
  onReload,
  isReloading,
}: {
  detail: CatalogActivityDetail;
  centerId: string;
  isReloading: boolean;
  onReload: () => Promise<void>;
}) {
  const { api, tenantContext, handleSessionExpired } = useDashboardContext();
  const queryClient = useQueryClient();
  const { activity } = detail;
  const baseLocale = activity.baseLocale;
  const otherLocale: CatalogLocale = baseLocale === 'es' ? 'en' : 'es';
  const [etag, setEtag] = useState(detail.etag);
  const [locale, setLocale] = useState<CatalogLocale>(baseLocale);
  const [isTranslationOpen, setIsTranslationOpen] = useState(
    Boolean(
      activity.name[otherLocale] ||
        activity.description?.[otherLocale] ||
        activity.otherDescription?.[otherLocale],
    ),
  );
  const [translations, setTranslations] = useState({
    es: {
      name: activity.name.es ?? '',
      description: activity.description?.es ?? '',
    },
    en: {
      name: activity.name.en ?? '',
      description: activity.description?.en ?? '',
    },
  });
  const [capacity, setCapacity] = useState(
    activity.defaultCapacity?.toString() ?? '',
  );
  const [category, setCategory] = useState<ActivityCategory | ''>(
    activity.category ?? '',
  );
  const [otherDescription, setOtherDescription] = useState<
    Record<CatalogLocale, string>
  >({
    es: activity.otherDescription?.es ?? '',
    en: activity.otherDescription?.en ?? '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: UpdateCatalogActivityInput) => {
      if (!tenantContext)
        throw new Error('An authorized center context is required.');
      return api.updateActivity(
        tenantContext,
        centerId,
        activity.id,
        input,
        etag,
      );
    },
    onSuccess: (revision) => {
      setEtag(revision);
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'catalog', 'activities'],
        refetchType: 'none',
      });
    },
    onError: (error) => {
      if (
        error instanceof DashboardApiError &&
        error.kind === 'session-expired'
      )
        handleSessionExpired();
    },
    retry: false,
  });
  const isBusy = mutation.isPending || isReloading;
  return (
    <>
      <div className={styles.languageBar}>
        {isTranslationOpen ? (
          <label className={styles.field} htmlFor="edit-activity-language">
            <span>Language</span>
            <Select
              id="edit-activity-language"
              value={locale}
              disabled={isBusy}
              onChange={(event) =>
                setLocale(event.target.value as CatalogLocale)
              }
            >
              <option value={baseLocale}>
                {LOCALE_LABELS[baseLocale]} (base language)
              </option>
              <option value={otherLocale}>{LOCALE_LABELS[otherLocale]}</option>
            </Select>
          </label>
        ) : (
          <>
            <p className={styles.fieldHint}>
              Writing in {LOCALE_LABELS[baseLocale]}, the catalog language.
            </p>
            <Button
              variant="secondary"
              size="compact"
              disabled={isBusy}
              onClick={() => {
                setIsTranslationOpen(true);
                setLocale(otherLocale);
              }}
            >
              Add {LOCALE_LABELS[otherLocale]} translation
            </Button>
          </>
        )}
      </div>
      <form
        className={styles.form}
        aria-label="Activity translation"
        onSubmit={(event) => {
          event.preventDefault();
          if (isBusy) return;
          setValidationError(null);
          if (
            locale === activity.baseLocale &&
            !translations[locale].name.trim()
          ) {
            setValidationError('The base-language activity name is required.');
            return;
          }
          mutation.mutate({
            group: 'translation',
            locale,
            values: translations[locale],
          });
        }}
      >
        <fieldset
          className={`${styles.form} ${styles.formFields}`}
          disabled={isBusy}
        >
          <label className={styles.field} htmlFor="edit-activity-name">
            <span>Name</span>
            <Input
              id="edit-activity-name"
              value={translations[locale].name}
              required={locale === activity.baseLocale}
              onChange={(event) => {
                const name = event.target.value;
                setTranslations((current) => ({
                  ...current,
                  [locale]: { ...current[locale], name },
                }));
              }}
            />
          </label>
          <label className={styles.field} htmlFor="edit-activity-description">
            <span>Description</span>
            <Input
              id="edit-activity-description"
              value={translations[locale].description}
              onChange={(event) => {
                const description = event.target.value;
                setTranslations((current) => ({
                  ...current,
                  [locale]: { ...current[locale], description },
                }));
              }}
            />
          </label>
          <Button type="submit" disabled={isBusy}>
            Save translation
          </Button>
        </fieldset>
      </form>
      <form
        className={styles.form}
        aria-label="Common activity facts"
        onSubmit={(event) => {
          event.preventDefault();
          if (isBusy) return;
          setValidationError(null);
          const defaultCapacity = capacity.trim() ? Number(capacity) : null;
          if (
            defaultCapacity !== null &&
            (!Number.isSafeInteger(defaultCapacity) || defaultCapacity <= 0)
          ) {
            setValidationError(
              'Default capacity must be a positive whole number.',
            );
            return;
          }
          mutation.mutate({ group: 'common', values: { defaultCapacity } });
        }}
      >
        <label className={styles.field} htmlFor="edit-activity-capacity">
          <span>Default capacity</span>
          <Input
            id="edit-activity-capacity"
            type="number"
            min="1"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            value={capacity}
            disabled={isBusy}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={isBusy}>
          Save common facts
        </Button>
      </form>
      <form
        className={styles.form}
        aria-label="Activity category"
        onSubmit={(event) => {
          event.preventDefault();
          if (isBusy) return;
          setValidationError(null);
          if (category === 'other') {
            if (!otherDescription[baseLocale].trim()) {
              setValidationError(
                `Describe the other category in ${LOCALE_LABELS[baseLocale]}.`,
              );
              return;
            }
            if (
              Object.values(otherDescription).some(
                (text) => [...text].length > OTHER_DESCRIPTION_MAX_LENGTH,
              )
            ) {
              setValidationError(
                `The other category description is limited to ${OTHER_DESCRIPTION_MAX_LENGTH} characters.`,
              );
              return;
            }
          }
          mutation.mutate({
            group: 'commercial',
            values: {
              category: category || null,
              otherDescription:
                category === 'other' ? authoredText(otherDescription) : {},
            },
          });
        }}
      >
        <fieldset
          className={`${styles.form} ${styles.formFields}`}
          disabled={isBusy}
        >
          <label className={styles.field} htmlFor="edit-activity-category">
            <span>Category</span>
            <Select
              id="edit-activity-category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ActivityCategory | '')
              }
            >
              <option value="">No category</option>
              {ACTIVITY_CATEGORIES.map((code) => (
                <option key={code} value={code}>
                  {ACTIVITY_CATEGORY_LABELS[code]}
                </option>
              ))}
            </Select>
          </label>
          {category === 'other' && (
            <div className={styles.field}>
              <label htmlFor="edit-activity-other-description">
                Other category description
              </label>
              <Input
                id="edit-activity-other-description"
                value={otherDescription[locale]}
                required={locale === baseLocale}
                aria-describedby="edit-activity-other-description-hint"
                onChange={(event) => {
                  const text = event.target.value;
                  setOtherDescription((current) => ({
                    ...current,
                    [locale]: text,
                  }));
                }}
              />
              <span
                id="edit-activity-other-description-hint"
                className={styles.fieldHint}
              >
                In {LOCALE_LABELS[locale]}. Required in{' '}
                {LOCALE_LABELS[baseLocale]}.
              </span>
            </div>
          )}
          <Button type="submit" disabled={isBusy}>
            Save category
          </Button>
        </fieldset>
      </form>
      {validationError && <Notice role="alert">{validationError}</Notice>}
      {mutation.isSuccess && (
        <Notice tone="success" role="status">
          Activity saved.
        </Notice>
      )}
      {mutation.error && (
        <Notice role="alert">
          {describeCatalogError(mutation.error)} Your draft has been preserved.
        </Notice>
      )}
      <Button
        variant="secondary"
        disabled={isBusy}
        onClick={() => void onReload()}
      >
        Reload current activity
      </Button>
    </>
  );
}

function authoredText(values: Record<CatalogLocale, string>): LocalizedText {
  return Object.fromEntries(
    Object.entries(values).filter(([, text]) => text.trim() !== ''),
  );
}

function focusOnMount(node: HTMLElement | null) {
  node?.focus();
}

function DisableActivityAction({
  activityId,
  centerId,
  isReloading,
  onDisabled,
}: {
  activityId: string;
  centerId: string;
  isReloading: boolean;
  onDisabled: () => Promise<void>;
}) {
  const { api, tenantContext, handleSessionExpired } = useDashboardContext();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => {
      if (!tenantContext)
        throw new Error('An authorized center context is required.');
      return api.disableActivity(tenantContext, centerId, activityId);
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'catalog', 'activities'],
        refetchType: 'none',
      });
      await onDisabled();
    },
    onError: (error) => {
      if (
        error instanceof DashboardApiError &&
        error.kind === 'session-expired'
      )
        handleSessionExpired();
    },
    retry: false,
  });
  const isBusy = mutation.isPending || isReloading;
  return (
    <div className={styles.disableAction}>
      {isConfirming ? (
        <Notice
          role="group"
          aria-labelledby="disable-activity-title"
          aria-describedby="disable-activity-detail"
        >
          <strong id="disable-activity-title">Disable this activity?</strong>
          <span id="disable-activity-detail">
            New sessions and bookings will stop. Existing sessions and bookings
            stay as they are and must be managed separately. Unsaved changes are
            discarded when the activity reloads.
          </span>
          <span className={styles.inlineActions}>
            <Button disabled={isBusy} onClick={() => mutation.mutate()}>
              Confirm disable
            </Button>
            <Button
              ref={focusOnMount}
              variant="secondary"
              disabled={isBusy}
              onClick={() => {
                mutation.reset();
                setIsConfirming(false);
              }}
            >
              Keep published
            </Button>
          </span>
        </Notice>
      ) : (
        <Button
          variant="secondary"
          disabled={isBusy}
          onClick={() => setIsConfirming(true)}
        >
          Disable activity
        </Button>
      )}
      {mutation.error && (
        <Notice role="alert">{describeCatalogError(mutation.error)}</Notice>
      )}
    </div>
  );
}

function EnableActivityAction({
  activityId,
  centerId,
  isReloading,
  onEnabled,
}: {
  activityId: string;
  centerId: string;
  isReloading: boolean;
  onEnabled: () => Promise<void>;
}) {
  const { api, tenantContext, handleSessionExpired } = useDashboardContext();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      if (!tenantContext)
        throw new Error('An authorized center context is required.');
      return api.publishActivity(tenantContext, centerId, activityId);
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'catalog', 'activities'],
        refetchType: 'none',
      });
      await onEnabled();
    },
    onError: (error) => {
      if (
        error instanceof DashboardApiError &&
        error.kind === 'session-expired'
      )
        handleSessionExpired();
    },
    retry: false,
  });
  const isBusy = mutation.isPending || isReloading;
  return (
    <div className={styles.disableAction}>
      <Button
        variant="secondary"
        disabled={isBusy}
        onClick={() => mutation.mutate()}
      >
        Enable activity
      </Button>
      {mutation.error && (
        <Notice role="alert">{describeCatalogError(mutation.error)}</Notice>
      )}
    </div>
  );
}
