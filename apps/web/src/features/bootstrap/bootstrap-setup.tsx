'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Button, Input, Notice, Select } from '../../components/ui/controls';
import { centerDashboardUrl } from '../../lib/application-hosts';
import styles from './bootstrap.module.css';
import { BootstrapApiError, completeTenantBootstrap } from './bootstrap-api';
import { BootstrapStatus } from './bootstrap-status';

const copy = {
  en: {
    kicker: 'Initial setup',
    title: 'Open your first center',
    summary:
      'Confirm the essentials. Everything else can wait until the first dive day.',
    operator: 'Operation name',
    center: 'First center name',
    timeZone: 'Center time zone',
    searchTimeZone: 'Search time zones',
    selectTimeZone: 'Select a time zone',
    timeZoneRequired: 'Select a time zone to continue.',
    confirm: 'I confirm this is the center’s local time zone.',
    submit: 'Create operation',
    submitting: 'Creating operation…',
    confirmationRequired: 'Confirm the time zone to continue.',
    sessionExpired: 'Your session expired. Sign in again.',
    setupFailed:
      'Setup could not be completed. Check your invitation or contact support.',
  },
  es: {
    kicker: 'Configuración inicial',
    title: 'Abre tu primer centro',
    summary:
      'Confirma lo esencial. El resto puede esperar hasta el primer día de buceo.',
    operator: 'Nombre del operador',
    center: 'Nombre del primer centro',
    timeZone: 'Zona horaria del centro',
    searchTimeZone: 'Buscar zona horaria',
    selectTimeZone: 'Selecciona una zona horaria',
    timeZoneRequired: 'Selecciona una zona horaria para continuar.',
    confirm: 'Confirmo que esta es la zona horaria local del centro.',
    submit: 'Crear operador',
    submitting: 'Creando operador…',
    confirmationRequired: 'Confirma la zona horaria para continuar.',
    sessionExpired: 'La sesión ha caducado. Vuelve a iniciar sesión.',
    setupFailed:
      'No se pudo completar la configuración. Revisa tu invitación o contacta con soporte.',
  },
} as const;

export function BootstrapSetup({
  apiBaseUrl,
  clerkConfigured,
  centerAppBaseDomain,
  centerAppBaseOrigin,
  timeZones,
  navigate = (destination: string) => window.location.replace(destination),
}: Readonly<{
  apiBaseUrl: string;
  clerkConfigured: boolean;
  centerAppBaseDomain?: string;
  centerAppBaseOrigin?: string | undefined;
  timeZones: readonly string[];
  navigate?: (destination: string) => void;
}>) {
  if (!clerkConfigured || !apiBaseUrl || !centerAppBaseDomain) {
    return (
      <BootstrapStatus
        kicker="BlueCurrent"
        title="Setup is unavailable"
        body="Contact support if the problem continues."
      />
    );
  }
  return (
    <AuthenticatedBootstrapSetup
      apiBaseUrl={apiBaseUrl}
      centerAppBaseDomain={centerAppBaseDomain}
      centerAppBaseOrigin={centerAppBaseOrigin}
      timeZones={timeZones}
      navigate={navigate}
    />
  );
}

function AuthenticatedBootstrapSetup({
  apiBaseUrl,
  centerAppBaseDomain,
  centerAppBaseOrigin,
  timeZones,
  navigate,
}: Readonly<{
  apiBaseUrl: string;
  centerAppBaseDomain: string;
  centerAppBaseOrigin?: string | undefined;
  timeZones: readonly string[];
  navigate: (destination: string) => void;
}>) {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [locale, setLocale] = useState<'en' | 'es'>('en');
  const [timeZone, setTimeZone] = useState('');
  const [suggestedTimeZone, setSuggestedTimeZone] = useState('');
  const [timeZoneSearch, setTimeZoneSearch] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const text = copy[locale];
  const availableTimeZones = [
    ...new Set([
      ...timeZones,
      ...(suggestedTimeZone ? [suggestedTimeZone] : []),
    ]),
  ].sort();
  const normalizedSearch = timeZoneSearch
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_');
  const visibleTimeZones = availableTimeZones.filter(
    (option) =>
      option === timeZone || option.toLowerCase().includes(normalizedSearch),
  );

  useEffect(() => {
    setLocale(navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en');
    try {
      const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectedTimeZone) {
        setSuggestedTimeZone(detectedTimeZone);
        setTimeZone(detectedTimeZone);
      }
    } catch {
      setSuggestedTimeZone('');
    }
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  async function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!timeZone || !availableTimeZones.includes(timeZone)) {
      setMessage(text.timeZoneRequired);
      return;
    }
    if (!confirmed) {
      setMessage(text.confirmationRequired);
      return;
    }
    const formData = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await completeTenantBootstrap({
        apiBaseUrl,
        getToken,
        input: {
          operatorDisplayName: String(
            formData.get('operatorDisplayName') ?? '',
          ),
          centerDisplayName: String(formData.get('centerDisplayName') ?? ''),
          timeZone,
          locale,
        },
      });
      navigate(
        centerDashboardUrl(
          result.centerKey,
          centerAppBaseDomain,
          centerAppBaseOrigin,
        ),
      );
    } catch (error) {
      if (error instanceof BootstrapApiError && error.status === 401) {
        setMessage(text.sessionExpired);
      } else {
        setMessage(text.setupFailed);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <BootstrapStatus
        kicker="BlueCurrent"
        title="Checking your session"
        body="Contact support if the problem continues."
      />
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.intro} aria-labelledby="setup-title">
        <p className={styles.brand}>BlueCurrent</p>
        <div>
          <p className={styles.kicker}>{text.kicker}</p>
          <h1 id="setup-title">{text.title}</h1>
          <p>{text.summary}</p>
        </div>
        <p className={styles.caption}>Step 1 of 1</p>
      </section>
      <section className={styles.workspace}>
        <form
          className={`${styles.panel} ${styles.form}`}
          onSubmit={submitSetup}
        >
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.step}>Workspace</p>
              <h2>{text.title}</h2>
            </div>
            <fieldset className={styles.localeSwitcher}>
              <legend>Language</legend>
              {(['es', 'en'] as const).map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="locale"
                    value={option}
                    checked={locale === option}
                    onChange={() => setLocale(option)}
                  />
                  {option.toUpperCase()}
                </label>
              ))}
            </fieldset>
          </div>
          <label htmlFor="setup-operator-name">
            {text.operator}
            <Input
              id="setup-operator-name"
              name="operatorDisplayName"
              type="text"
              maxLength={120}
              autoComplete="organization"
              required
            />
          </label>
          <label htmlFor="setup-center-name">
            {text.center}
            <Input
              id="setup-center-name"
              name="centerDisplayName"
              type="text"
              maxLength={120}
              autoComplete="off"
              required
            />
          </label>
          <label htmlFor="setup-time-zone-search">
            {text.searchTimeZone}
            <Input
              id="setup-time-zone-search"
              type="search"
              value={timeZoneSearch}
              onChange={(event) => setTimeZoneSearch(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label htmlFor="setup-time-zone">
            {text.timeZone}
            <Select
              id="setup-time-zone"
              name="timeZone"
              value={timeZone}
              onChange={(event) => {
                setTimeZone(event.target.value);
                setConfirmed(false);
                setMessage(null);
              }}
              required
            >
              <option value="">{text.selectTimeZone}</option>
              {visibleTimeZones.map((option) => (
                <option key={option} value={option}>
                  {option.split('/').at(-1)?.replaceAll('_', ' ')} ({option})
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{text.confirm}</span>
          </label>
          {message ? (
            <Notice variant="inline" tone="warning" as="p" role="alert">
              {message}
            </Notice>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? text.submitting : text.submit}
          </Button>
        </form>
      </section>
    </main>
  );
}
