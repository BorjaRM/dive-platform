'use client';

import { useClerk, useSignIn, useSignUp, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

type AcceptancePhase =
  | 'loading'
  | 'ready'
  | 'active-session'
  | 'submitting'
  | 'missing'
  | 'failed';
type EnrollmentMode = 'new' | 'existing';

function removeTicketFromAddressBar() {
  window.history.replaceState(window.history.state, '', '/bootstrap/accept');
}

export function BootstrapAcceptance() {
  const router = useRouter();
  const { isLoaded: userLoaded, isSignedIn } = useUser();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { signOut } = useClerk();
  const ticket = useRef<string | null>(null);
  const [phase, setPhase] = useState<AcceptancePhase>('loading');
  const [mode, setMode] = useState<EnrollmentMode>('new');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ticket.current === null) {
      ticket.current =
        new URLSearchParams(window.location.search).get('__clerk_ticket') ?? '';
      if (ticket.current) removeTicketFromAddressBar();
    }
    if (!userLoaded) return;
    if (!ticket.current) {
      setPhase('missing');
      return;
    }
    if (isSignedIn) {
      setPhase('active-session');
      return;
    }
    setPhase('ready');
  }, [isSignedIn, userLoaded]);

  const navigateToSetup = ({
    decorateUrl,
  }: {
    decorateUrl: (url: string) => string;
  }) => {
    const destination = decorateUrl('/bootstrap/setup');
    if (destination.startsWith('http')) {
      window.location.assign(destination);
    } else {
      router.replace(destination);
    }
  };

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invitationTicket = ticket.current;
    if (!invitationTicket || !signIn || !signUp) {
      setPhase('failed');
      return;
    }
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const passwordConfirmation = String(
      formData.get('passwordConfirmation') ?? '',
    );
    if (mode === 'new' && password !== passwordConfirmation) {
      setMessage('Passwords do not match.');
      return;
    }
    setMessage(null);
    setPhase('submitting');
    try {
      if (mode === 'new') {
        const ticketResult = await signUp.ticket({ ticket: invitationTicket });
        if (ticketResult.error) throw new Error('invitation_failed');
        if (signUp.status !== 'complete') {
          const passwordResult = await signUp.password({ password });
          if (passwordResult.error) throw new Error('invitation_failed');
        }
        if (signUp.status !== 'complete') throw new Error('invitation_failed');
        removeTicketFromAddressBar();
        const finalizeResult = await signUp.finalize({
          navigate: navigateToSetup,
        });
        if (finalizeResult.error) throw new Error('invitation_failed');
      } else {
        const ticketResult = await signIn.ticket({ ticket: invitationTicket });
        if (ticketResult.error) throw new Error('invitation_failed');
        if (signIn.status === 'needs_first_factor') {
          const passwordResult = await signIn.password({ password });
          if (passwordResult.error) throw new Error('invitation_failed');
        }
        if (signIn.status !== 'complete') throw new Error('invitation_failed');
        removeTicketFromAddressBar();
        const finalizeResult = await signIn.finalize({
          navigate: navigateToSetup,
        });
        if (finalizeResult.error) throw new Error('invitation_failed');
      }
    } catch {
      setMessage(
        'This invitation could not be accepted. Request a new invitation or try another account.',
      );
      setPhase('failed');
    }
  }

  async function confirmReauthentication() {
    setMessage(null);
    setPhase('loading');
    try {
      await signOut(() => {
        setPhase(ticket.current ? 'ready' : 'missing');
      });
    } catch {
      setMessage(
        'This invitation could not be continued. Try again or request a new invitation.',
      );
      setPhase('active-session');
    }
  }

  if (phase === 'loading') {
    return <AcceptanceStatus title="Checking your invitation" />;
  }
  if (phase === 'missing') {
    return (
      <AcceptanceStatus
        title="This invitation cannot be opened"
        body="Request a new invitation or contact support."
      />
    );
  }
  if (phase === 'active-session') {
    return (
      <AcceptanceFrame title="Confirm your account">
        <p className="bootstrap-form-copy">
          Sign out of the active account, then authenticate with the account for
          this invitation.
        </p>
        {message ? (
          <p className="bootstrap-feedback" role="alert">
            {message}
          </p>
        ) : null}
        <div className="bootstrap-actions">
          <button
            className="bootstrap-primary"
            type="button"
            onClick={confirmReauthentication}
          >
            Sign out and continue
          </button>
        </div>
      </AcceptanceFrame>
    );
  }

  return (
    <AcceptanceFrame title="Accept your invitation">
      <fieldset className="bootstrap-segments">
        <legend>Account type</legend>
        <button
          type="button"
          aria-pressed={mode === 'new'}
          onClick={() => setMode('new')}
        >
          New account
        </button>
        <button
          type="button"
          aria-pressed={mode === 'existing'}
          onClick={() => setMode('existing')}
        >
          Existing account
        </button>
      </fieldset>
      <form className="bootstrap-form" onSubmit={acceptInvitation}>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </label>
        {mode === 'new' ? (
          <label>
            Confirm password
            <input
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
        ) : null}
        {message ? (
          <p className="bootstrap-feedback" role="alert">
            {message}
          </p>
        ) : null}
        <button
          className="bootstrap-primary"
          type="submit"
          disabled={phase === 'submitting'}
        >
          {phase === 'submitting' ? 'Accepting invitation…' : 'Continue'}
        </button>
      </form>
    </AcceptanceFrame>
  );
}

function AcceptanceFrame({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <main className="bootstrap-shell">
      <section className="bootstrap-intro">
        <p className="bootstrap-brand">BlueCurrent</p>
        <div>
          <p className="bootstrap-kicker">Private invitation</p>
          <h1>Build the base for every dive day.</h1>
          <p>Your invitation creates one operation and its first center.</p>
        </div>
        <p className="bootstrap-caption">Secure, invitation-only access</p>
      </section>
      <section className="bootstrap-workspace">
        <div className="bootstrap-panel">
          <p className="bootstrap-step">Invitation</p>
          <h2>{title}</h2>
          {children}
        </div>
      </section>
    </main>
  );
}

function AcceptanceStatus({
  title,
  body = 'Preparing secure invitation access.',
}: Readonly<{ title: string; body?: string }>) {
  return (
    <main className="bootstrap-status-page">
      <section className="bootstrap-notice" role="status">
        <p className="bootstrap-kicker">Invitation access</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}
