'use client';

import { useClerk, useSignIn, useSignUp, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Input, Notice } from '../../components/ui/controls';
import styles from './bootstrap.module.css';

type AcceptancePhase =
  | 'loading'
  | 'ready'
  | 'active-session'
  | 'submitting'
  | 'missing'
  | 'failed';
type InvitationFlow = 'sign_in' | 'sign_up';
type Invitation = { ticket: string; flow: InvitationFlow | null };
type AcceptanceOperation =
  | 'idle'
  | 'reauthenticating'
  | 'reauthenticated'
  | 'submitting'
  | 'failed';

function resolveAcceptancePhase({
  operation,
  userLoaded,
  invitation,
  isSignedIn,
}: {
  operation: AcceptanceOperation;
  userLoaded: boolean;
  invitation: Invitation | null;
  isSignedIn: boolean | undefined;
}): AcceptancePhase {
  if (operation === 'submitting' || operation === 'failed') return operation;
  if (operation === 'reauthenticating' || !userLoaded || !invitation) {
    return 'loading';
  }
  if (!invitation.ticket || !invitation.flow) return 'missing';
  if (isSignedIn) return 'active-session';
  return 'ready';
}

function invitationFlowFromStatus(
  status: string | null,
): InvitationFlow | null {
  if (status === 'sign_in' || status === 'sign_up') return status;
  return null;
}

function removeTicketFromAddressBar() {
  window.history.replaceState(window.history.state, '', '/bootstrap/accept');
}

export function BootstrapAcceptance() {
  const router = useRouter();
  const { isLoaded: userLoaded, isSignedIn } = useUser();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { signOut } = useClerk();
  const invitationRef = useRef<Invitation | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [operation, setOperation] = useState<AcceptanceOperation>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (invitationRef.current === null) {
      const params = new URLSearchParams(window.location.search);
      invitationRef.current = {
        ticket: params.get('__clerk_ticket') ?? '',
        flow: invitationFlowFromStatus(params.get('__clerk_status')),
      };
      if (invitationRef.current.ticket) removeTicketFromAddressBar();
    }
    setInvitation(invitationRef.current);
  }, []);

  const phase = resolveAcceptancePhase({
    operation,
    userLoaded,
    invitation,
    isSignedIn,
  });

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
    const invitationTicket = invitation?.ticket;
    const invitationFlow = invitation?.flow;
    if (!invitationTicket || !invitationFlow || !signIn || !signUp) {
      setOperation('failed');
      return;
    }
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const passwordConfirmation = String(
      formData.get('passwordConfirmation') ?? '',
    );
    if (invitationFlow === 'sign_up' && password !== passwordConfirmation) {
      setMessage('Passwords do not match.');
      return;
    }
    setMessage(null);
    setOperation('submitting');
    try {
      if (invitationFlow === 'sign_up') {
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
      setOperation('failed');
    }
  }

  async function confirmReauthentication() {
    setMessage(null);
    setOperation('reauthenticating');
    try {
      await signOut(() => {
        setOperation('reauthenticated');
      });
    } catch {
      setMessage(
        'This invitation could not be continued. Try again or request a new invitation.',
      );
      setOperation('idle');
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
        <p className={styles.formCopy}>
          Sign out of the active account, then authenticate with the account for
          this invitation.
        </p>
        {message ? (
          <Notice variant="inline" tone="warning" as="p" role="alert">
            {message}
          </Notice>
        ) : null}
        <div className={styles.actions}>
          <Button type="button" onClick={confirmReauthentication}>
            Sign out and continue
          </Button>
        </div>
      </AcceptanceFrame>
    );
  }

  const invitationFlow = invitation?.flow;
  if (invitationFlow !== 'sign_in' && invitationFlow !== 'sign_up') {
    return (
      <AcceptanceStatus
        title="This invitation cannot be opened"
        body="Request a new invitation or contact support."
      />
    );
  }

  return (
    <AcceptanceFrame title="Accept your invitation">
      <p className={styles.formCopy}>
        {invitationFlow === 'sign_up'
          ? 'Create a password to accept this invitation.'
          : 'Enter your password to accept this invitation.'}
      </p>
      <form className={styles.form} onSubmit={acceptInvitation}>
        <label htmlFor="invitation-password">
          Password
          <Input
            id="invitation-password"
            name="password"
            type="password"
            autoComplete={
              invitationFlow === 'sign_up' ? 'new-password' : 'current-password'
            }
            minLength={8}
            required
          />
        </label>
        {invitationFlow === 'sign_up' ? (
          <>
            <label htmlFor="invitation-password-confirmation">
              Confirm password
              <Input
                id="invitation-password-confirmation"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <div id="clerk-captcha" />
          </>
        ) : null}
        {message ? (
          <Notice variant="inline" tone="warning" as="p" role="alert">
            {message}
          </Notice>
        ) : null}
        <Button type="submit" disabled={phase === 'submitting'}>
          {phase === 'submitting' ? 'Accepting invitation…' : 'Continue'}
        </Button>
      </form>
    </AcceptanceFrame>
  );
}

function AcceptanceFrame({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <main className={styles.shell}>
      <section className={styles.intro}>
        <p className={styles.brand}>BlueCurrent</p>
        <div>
          <p className={styles.kicker}>Private invitation</p>
          <h1>Build the base for every dive day.</h1>
          <p>Your invitation creates one operation and its first center.</p>
        </div>
        <p className={styles.caption}>Secure, invitation-only access</p>
      </section>
      <section className={styles.workspace}>
        <div className={styles.panel}>
          <p className={styles.step}>Invitation</p>
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
    <main className={styles.statusPage}>
      <section className={styles.notice} role="status">
        <p className={styles.kicker}>Invitation access</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}
