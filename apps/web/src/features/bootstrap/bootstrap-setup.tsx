'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { BootstrapApiError, completeTenantBootstrap } from './bootstrap-api';

const copy = {
  en: {
    kicker: 'Initial setup',
    title: 'Open your first center',
    summary:
      'Confirm the essentials. Everything else can wait until the first dive day.',
    operator: 'Operation name',
    center: 'First center name',
    timeZone: 'Center time zone',
    confirm: 'I confirm this is the center’s local time zone.',
    submit: 'Create operation',
    submitting: 'Creating operation…',
  },
  es: {
    kicker: 'Configuración inicial',
    title: 'Abre tu primer centro',
    summary:
      'Confirma lo esencial. El resto puede esperar hasta el primer día de buceo.',
    operator: 'Nombre del operador',
    center: 'Nombre del primer centro',
    timeZone: 'Zona horaria del centro',
    confirm: 'Confirmo que esta es la zona horaria local del centro.',
    submit: 'Crear operador',
    submitting: 'Creando operador…',
  },
} as const;

export function BootstrapSetup({
  apiBaseUrl,
  clerkConfigured,
}: Readonly<{ apiBaseUrl: string; clerkConfigured: boolean }>) {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [locale, setLocale] = useState<'en' | 'es'>('en');
  const [timeZone, setTimeZone] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const text = copy[locale];

  useEffect(() => {
    setLocale(navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en');
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  async function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) {
      setMessage(
        locale === 'es'
          ? 'Confirma la zona horaria para continuar.'
          : 'Confirm the time zone to continue.',
      );
      return;
    }
    const formData = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage(null);
    try {
      await completeTenantBootstrap({
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
      router.replace('/dashboard');
    } catch (error) {
      const sessionExpired =
        error instanceof BootstrapApiError && error.status === 401;
      setMessage(
        sessionExpired
          ? locale === 'es'
            ? 'La sesión ha caducado. Vuelve a iniciar sesión.'
            : 'Your session expired. Sign in again.'
          : locale === 'es'
            ? 'No se pudo completar la configuración. Revisa tu invitación o contacta con soporte.'
            : 'Setup could not be completed. Check your invitation or contact support.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!clerkConfigured || !apiBaseUrl) {
    return <SetupStatus title="Setup is unavailable" />;
  }
  if (!isLoaded || !isSignedIn) {
    return <SetupStatus title="Checking your session" />;
  }

  return (
    <main className="bootstrap-shell setup-shell">
      <section className="bootstrap-intro" aria-labelledby="setup-title">
        <p className="bootstrap-brand">BlueCurrent</p>
        <div>
          <p className="bootstrap-kicker">{text.kicker}</p>
          <h1 id="setup-title">{text.title}</h1>
          <p>{text.summary}</p>
        </div>
        <p className="bootstrap-caption">Step 1 of 1</p>
      </section>
      <section className="bootstrap-workspace">
        <form className="bootstrap-panel bootstrap-form" onSubmit={submitSetup}>
          <div className="bootstrap-panel-heading">
            <div>
              <p className="bootstrap-step">Workspace</p>
              <h2>{text.title}</h2>
            </div>
            <fieldset className="locale-switcher">
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
          <label>
            {text.operator}
            <input
              name="operatorDisplayName"
              type="text"
              maxLength={120}
              autoComplete="organization"
              required
            />
          </label>
          <label>
            {text.center}
            <input
              name="centerDisplayName"
              type="text"
              maxLength={120}
              autoComplete="off"
              required
            />
          </label>
          <label>
            {text.timeZone}
            <input
              name="timeZone"
              type="text"
              value={timeZone}
              onChange={(event) => {
                setTimeZone(event.target.value);
                setConfirmed(false);
              }}
              autoComplete="off"
              required
            />
          </label>
          <label className="bootstrap-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{text.confirm}</span>
          </label>
          {message ? (
            <p className="bootstrap-feedback" role="alert">
              {message}
            </p>
          ) : null}
          <button
            className="bootstrap-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? text.submitting : text.submit}
          </button>
        </form>
      </section>
    </main>
  );
}

function SetupStatus({ title }: Readonly<{ title: string }>) {
  return (
    <main className="bootstrap-status-page">
      <section className="bootstrap-notice" role="status">
        <p className="bootstrap-kicker">BlueCurrent</p>
        <h1>{title}</h1>
        <p>Contact support if the problem continues.</p>
      </section>
    </main>
  );
}
