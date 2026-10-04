'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Input, Notice, Select } from '../../components/ui/controls';
import styles from './catalog.module.css';
import type {
  CatalogActivityDetail,
  CatalogLocale,
  UpdateCatalogActivityInput,
} from './catalog-api';
import { describeCatalogError } from './catalog-feedback';
import { useDashboardContext } from './dashboard-context';
import { DashboardApiError } from './tenant-context';

export function EditCatalogActivity({
  detail,
  centerId,
  canEditActivity,
  onReload,
}: {
  detail: CatalogActivityDetail;
  centerId: string;
  canEditActivity: boolean;
  onReload: () => Promise<CatalogActivityDetail | null>;
}) {
  const [loadedDetail, setLoadedDetail] = useState(detail);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState<Error | null>(null);
  return (
    <>
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
    </>
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
  return (
    <section
      className={styles.section}
      aria-labelledby="activity-details-heading"
    >
      <div className={styles.sectionHeading}>
        <h3 id="activity-details-heading">Activity details</h3>
        <span>{activity.status}</span>
      </div>
      <p>
        <strong>Name</strong>:{' '}
        {activity.name.es ?? activity.name.en ?? 'Unnamed activity'}
      </p>
      <p>
        <strong>Description</strong>:{' '}
        {activity.description?.es ??
          activity.description?.en ??
          'No description'}
      </p>
      <p>
        <strong>Default capacity</strong>:{' '}
        {activity.defaultCapacity ?? 'Not set'}
      </p>
    </section>
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
  const [etag, setEtag] = useState(detail.etag);
  const [locale, setLocale] = useState<CatalogLocale>(activity.baseLocale);
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
    <section className={styles.section} aria-labelledby="edit-activity-heading">
      <div className={styles.sectionHeading}>
        <h3 id="edit-activity-heading">Activity details</h3>
        <span>{activity.status}</span>
      </div>
      <label className={styles.field} htmlFor="edit-activity-language">
        <span>Language</span>
        <Select
          id="edit-activity-language"
          value={locale}
          disabled={isBusy}
          onChange={(event) => setLocale(event.target.value as CatalogLocale)}
        >
          <option value="es">Spanish</option>
          <option value="en">English</option>
        </Select>
      </label>
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
    </section>
  );
}
