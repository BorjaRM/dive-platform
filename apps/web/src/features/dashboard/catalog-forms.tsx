'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type UseFormRegisterReturn, useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  CatalogLocale,
  CatalogSettings,
  CreateCatalogActivityInput,
  CreateCatalogSlotInput,
  LocalizedText,
} from './catalog-api';
import { CatalogNotice, describeCatalogError } from './catalog-feedback';

function validPositiveInteger(value: string) {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
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

export function CatalogActivityEditor({
  settings,
  isBusy,
  onSelectLanguage,
  onCreate,
  onInvalid,
}: {
  settings: {
    data: CatalogSettings | undefined;
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: Error | null;
  };
  isBusy: boolean;
  onSelectLanguage: (locale: CatalogLocale) => void;
  onCreate: (input: CreateCatalogActivityInput, onSuccess: () => void) => void;
  onInvalid: () => void;
}) {
  const baseLocale = settings.data?.defaultActivityLocale ?? null;
  return (
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
      {settings.isPending && <CatalogNotice title="Loading catalog language" />}
      {settings.error && (
        <CatalogNotice
          title="Catalog language unavailable"
          message={describeCatalogError(settings.error)}
        />
      )}
      {baseLocale && (
        <p className="field-hint">
          Catalog language: {baseLocale === 'es' ? 'Spanish' : 'English'}
        </p>
      )}
      {settings.isSuccess && !baseLocale && (
        <form
          className="catalog-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (isBusy) return;
            const locale = new FormData(event.currentTarget).get(
              'catalogLocale',
            );
            if (locale === 'es' || locale === 'en') onSelectLanguage(locale);
          }}
        >
          <label className="catalog-field">
            <span>Catalog language</span>
            <select
              name="catalogLocale"
              required
              defaultValue=""
              disabled={isBusy}
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
            disabled={isBusy}
          >
            Save catalog language
          </button>
        </form>
      )}
      <CreateActivityForm
        baseLocale={baseLocale}
        disabled={settings.isError || settings.isPending || isBusy}
        onCreate={onCreate}
        onInvalid={onInvalid}
      />
    </section>
  );
}

function CreateActivityForm({
  baseLocale,
  disabled,
  onCreate,
  onInvalid,
}: {
  baseLocale: CatalogLocale | null;
  disabled: boolean;
  onCreate: (input: CreateCatalogActivityInput, onSuccess: () => void) => void;
  onInvalid: () => void;
}) {
  const form = useForm<ActivityFormValues>({
    defaultValues: {
      nameEs: '',
      nameEn: '',
      descriptionEs: '',
      descriptionEn: '',
      defaultCapacity: '',
    },
    resolver: zodResolver(activityFormSchema),
  });

  const submit = (values: ActivityFormValues) => {
    if (!baseLocale || disabled) return;
    const requiredField = baseLocale === 'es' ? 'nameEs' : 'nameEn';
    if (!values[requiredField].trim()) {
      onInvalid();
      form.setError(
        requiredField,
        {
          message: `Add the activity name in ${baseLocale === 'es' ? 'Spanish' : 'English'}.`,
        },
        { shouldFocus: true },
      );
      return;
    }
    const description = localizedValue(
      values.descriptionEs,
      values.descriptionEn,
    );
    onCreate(
      {
        name: localizedValue(values.nameEs, values.nameEn),
        ...(Object.keys(description).length > 0 ? { description } : {}),
        ...(values.defaultCapacity.trim()
          ? { defaultCapacity: Number(values.defaultCapacity) }
          : {}),
      },
      () => form.reset(),
    );
  };

  return (
    <form
      className="catalog-form"
      onSubmit={form.handleSubmit(submit, onInvalid)}
    >
      <fieldset
        className="catalog-form"
        style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
        disabled={!baseLocale || disabled}
      >
        <div className="form-field-grid">
          <Field
            id="activity-name-es"
            label="Name · ES"
            required={baseLocale === 'es'}
            registration={form.register('nameEs')}
            error={form.formState.errors.nameEs?.message}
          />
          <Field
            id="activity-name-en"
            label="Name · EN"
            required={baseLocale === 'en'}
            registration={form.register('nameEn')}
            error={form.formState.errors.nameEn?.message}
          />
        </div>
        <div className="form-field-grid">
          <Field
            id="activity-description-es"
            label="Description · ES"
            registration={form.register('descriptionEs')}
            error={form.formState.errors.descriptionEs?.message}
          />
          <Field
            id="activity-description-en"
            label="Description · EN"
            registration={form.register('descriptionEn')}
            error={form.formState.errors.descriptionEn?.message}
          />
        </div>
        <Field
          id="activity-capacity"
          label="Default capacity"
          type="number"
          min="1"
          registration={form.register('defaultCapacity')}
          error={form.formState.errors.defaultCapacity?.message}
        />
        <button
          className="catalog-primary-action"
          type="submit"
          disabled={!baseLocale || disabled}
        >
          Create activity
        </button>
      </fieldset>
    </form>
  );
}

export function CreateSlotForm({
  disabled,
  onCreate,
  onInvalid,
}: {
  disabled: boolean;
  onCreate: (input: CreateCatalogSlotInput, onSuccess: () => void) => void;
  onInvalid: () => void;
}) {
  const form = useForm<SlotFormValues>({
    defaultValues: { startsAt: '', durationMinutes: '60', capacity: '8' },
    resolver: zodResolver(slotFormSchema),
  });

  const submit = (values: SlotFormValues) => {
    if (disabled) return;
    onCreate(
      {
        startsAt: values.startsAt.trim(),
        durationMinutes: Number(values.durationMinutes),
        capacity: Number(values.capacity),
      },
      () => form.reset(),
    );
  };

  return (
    <form className="slot-form" onSubmit={form.handleSubmit(submit, onInvalid)}>
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
          registration={form.register('startsAt')}
          error={form.formState.errors.startsAt?.message}
        />
        <Field
          id="slot-duration"
          label="Duration · minutes"
          type="number"
          min="1"
          registration={form.register('durationMinutes')}
          error={form.formState.errors.durationMinutes?.message}
        />
        <Field
          id="slot-capacity"
          label="Capacity"
          type="number"
          min="1"
          registration={form.register('capacity')}
          error={form.formState.errors.capacity?.message}
        />
      </div>
      <button
        className="catalog-primary-action"
        type="submit"
        disabled={disabled}
      >
        Create slot
      </button>
    </form>
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

function localizedValue(es: string, en: string): LocalizedText {
  return {
    ...(es.trim() ? { es: es.trim() } : {}),
    ...(en.trim() ? { en: en.trim() } : {}),
  };
}
