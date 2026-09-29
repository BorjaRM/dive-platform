import {
  ClerkProvider,
  useClerk,
  useSignIn,
  useSignUp,
  useUser,
} from '@clerk/react';
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type ProbeState = Readonly<{
  phase: string;
  clerkStatus: string | null;
  providerCode: string | null;
  signedIn: boolean;
}>;

type ProbeApi = Readonly<{
  ready: Promise<ProbeState>;
  snapshot: () => ProbeState;
  classifyActiveSession: (expectedUserId: string) => Readonly<{
    matching: boolean;
    activeSessionPresent: boolean;
    accountSwitchAvailable: boolean;
  }>;
  establishSession: (
    emailAddress: string,
    secret: string,
  ) => Promise<ProbeState>;
  attemptUninvitedSignUp: (
    emailAddress: string,
    secret: string,
  ) => Promise<ProbeState>;
  attemptSignUp: (secret: string) => Promise<ProbeState>;
  finalizeSignUp: () => Promise<ProbeState>;
  attemptSignIn: (secret: string) => Promise<ProbeState>;
  finalizeSignIn: () => Promise<ProbeState>;
  navigateToSetup: () => ProbeState;
}>;

declare global {
  interface Window {
    __DIVE_CLERK_INVITATION_PROBE__?: ProbeApi;
  }
}

function safeProviderCode(error: unknown): string {
  const probeCode = (error as { probeCode?: unknown } | undefined)?.probeCode;
  if (typeof probeCode === 'string' && /^[a-z0-9_]+$/.test(probeCode)) {
    return probeCode;
  }
  const code = (
    error as { errors?: ReadonlyArray<{ code?: unknown }> } | undefined
  )?.errors?.[0]?.code;
  return typeof code === 'string' && /^[a-z0-9_]+$/.test(code)
    ? code
    : 'unknown_provider_error';
}

function settleWithin<T>(operation: Promise<T>, probeCode: string): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject({ probeCode }), 30_000);
    }),
  ]);
}

function InvitationProbe() {
  const ticket = useRef(
    new URL(window.location.href).searchParams.get('__clerk_ticket'),
  );
  const state = useRef<ProbeState>({
    phase: ticket.current ? 'ticket_received' : 'ticket_missing',
    clerkStatus: null,
    providerCode: null,
    signedIn: false,
  });
  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const { signUp } = useSignUp();
  const { signIn } = useSignIn();
  const { signOut } = useClerk();

  useEffect(() => {
    if (!userLoaded) return;

    const snapshot = () => Object.freeze({ ...state.current });
    const update = (values: Partial<ProbeState>) => {
      state.current = Object.freeze({ ...state.current, ...values });
      return snapshot();
    };
    const removeTicket = () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('__clerk_ticket');
      window.history.replaceState(null, '', cleanUrl);
      ticket.current = null;
    };
    const reject = (error: unknown) => {
      removeTicket();
      return update({
        phase: 'provider_rejected',
        providerCode: safeProviderCode(error),
      });
    };

    if (signUp.id) removeTicket();

    window.__DIVE_CLERK_INVITATION_PROBE__ = Object.freeze({
      ready: Promise.resolve(
        update({
          phase: signUp.id
            ? 'sign_up_restored'
            : ticket.current
              ? 'clerk_loaded'
              : 'ticket_missing',
          clerkStatus: signUp.id ? signUp.status : null,
          signedIn: isSignedIn,
        }),
      ),
      snapshot,
      classifyActiveSession: (expectedUserId) => {
        const matching = user?.id === expectedUserId;
        update({
          phase: matching ? 'matching_session' : 'different_session',
          signedIn: isSignedIn,
        });
        return Object.freeze({
          matching,
          activeSessionPresent: isSignedIn,
          accountSwitchAvailable: typeof signOut === 'function',
        });
      },
      establishSession: async (emailAddress, secret) => {
        try {
          const { error } = await signIn.create({
            identifier: emailAddress,
            password: secret,
          });
          if (error) return reject(error);
          if (signIn.status !== 'complete') {
            return update({
              phase: 'sign_in_incomplete',
              clerkStatus: signIn.status,
            });
          }
          const { error: finalizeError } = await signIn.finalize({
            navigate: async () => undefined,
          });
          if (finalizeError) return reject(finalizeError);
          return update({
            phase: 'session_established',
            clerkStatus: signIn.status,
            signedIn: true,
          });
        } catch (error) {
          return reject(error);
        }
      },
      attemptUninvitedSignUp: async (emailAddress, secret) => {
        try {
          const { error } = await signUp.create({
            emailAddress,
            password: secret,
          });
          if (error) return reject(error);
          return update({
            phase: 'uninvited_signup_unexpectedly_started',
            clerkStatus: signUp.status,
          });
        } catch (error) {
          return reject(error);
        }
      },
      attemptSignUp: async (secret) => {
        if (!ticket.current) return update({ phase: 'ticket_missing' });
        try {
          const { error } = await settleWithin(
            signUp.ticket({ ticket: ticket.current }),
            'ticket_operation_timeout',
          );
          if (error) return reject(error);
          if (signUp.status !== 'complete') {
            const { error: secretError } = await settleWithin(
              signUp.password({ password: secret }),
              'credential_operation_timeout',
            );
            if (secretError) return reject(secretError);
          }
          removeTicket();
          return update({
            phase:
              signUp.status === 'complete'
                ? 'ticket_processed'
                : 'sign_up_incomplete',
            clerkStatus: signUp.status,
          });
        } catch (error) {
          return reject(error);
        }
      },
      finalizeSignUp: async () => {
        if (signUp.status !== 'complete') {
          return update({
            phase: 'sign_up_incomplete',
            clerkStatus: signUp.status,
          });
        }
        const { error } = await signUp.finalize({
          navigate: async () => undefined,
        });
        if (error) return reject(error);
        return update({
          phase: 'sign_up_finalized',
          clerkStatus: signUp.status,
          signedIn: true,
        });
      },
      attemptSignIn: async (secret) => {
        if (!ticket.current) return update({ phase: 'ticket_missing' });
        try {
          const { error } = await signIn.ticket({ ticket: ticket.current });
          if (error) return reject(error);
          if (signIn.status === 'needs_first_factor') {
            const { error: secretError } = await signIn.password({
              password: secret,
            });
            if (secretError) return reject(secretError);
          }
          removeTicket();
          return update({
            phase:
              signIn.status === 'complete'
                ? 'ticket_processed'
                : 'sign_in_incomplete',
            clerkStatus: signIn.status,
            signedIn: isSignedIn,
          });
        } catch (error) {
          return reject(error);
        }
      },
      finalizeSignIn: async () => {
        if (signIn.status !== 'complete') {
          return update({
            phase: 'sign_in_incomplete',
            clerkStatus: signIn.status,
          });
        }
        const { error } = await signIn.finalize({
          navigate: async () => undefined,
        });
        if (error) return reject(error);
        return update({
          phase: 'sign_in_finalized',
          clerkStatus: signIn.status,
          signedIn: true,
        });
      },
      navigateToSetup: () => {
        if (!isSignedIn || window.location.search.includes('__clerk_ticket')) {
          return update({ phase: 'setup_navigation_denied' });
        }
        window.location.assign('/bootstrap/setup');
        return snapshot();
      },
    });

    return () => {
      delete window.__DIVE_CLERK_INVITATION_PROBE__;
    };
  }, [isSignedIn, signIn, signOut, signUp, user, userLoaded]);

  return (
    <main id="probe">
      <p>Invitation probe</p>
      <div id="clerk-captcha" />
    </main>
  );
}

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error('Clerk fixture key is missing');
const root = document.getElementById('root');
if (!root) throw new Error('Clerk fixture root is missing');

createRoot(root).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <InvitationProbe />
    </ClerkProvider>
  </StrictMode>,
);
