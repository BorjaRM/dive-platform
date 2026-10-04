'use client';

import { RedirectToSignIn, useAuth } from '@clerk/nextjs';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Input, Notice } from '../../components/ui/controls';
import {
  type BootstrapInvitationState,
  invitationUuid,
  parseBootstrapInvitationState,
} from '../../lib/bootstrap-invitation-state';
import styles from './platform-invitations.module.css';

type Props = Readonly<{
  clerkConfigured: boolean;
  returnUrl: string;
  requestTimeoutMillis: number;
}>;

export function PlatformInvitations(props: Props) {
  if (
    !props.clerkConfigured ||
    !Number.isSafeInteger(props.requestTimeoutMillis) ||
    props.requestTimeoutMillis <= 0
  ) {
    return (
      <main className={styles.page}>
        <h1>Invitation administration is unavailable</h1>
      </main>
    );
  }
  return <AuthenticatedInvitations {...props} />;
}

function AuthenticatedInvitations({ returnUrl, requestTimeoutMillis }: Props) {
  const { isLoaded, isSignedIn, sessionId, getToken } = useAuth();
  if (!isLoaded)
    return (
      <main className={styles.page} role="status">
        Checking your session
      </main>
    );
  if (!isSignedIn || !sessionId)
    return <RedirectToSignIn signInForceRedirectUrl={returnUrl} />;
  return (
    <InvitationConsole
      key={sessionId}
      getToken={getToken}
      returnUrl={returnUrl}
      requestTimeoutMillis={requestTimeoutMillis}
    />
  );
}

type InvitationAttempt = Readonly<{
  action: 'issue' | 'reissue' | 'revoke' | 'retry-revoke';
  invitationId?: string;
  input: Readonly<{ destinationEmail?: string; reason?: string }>;
  key: string;
  outcome: 'unknown' | 'rejected' | 'completed';
}>;
type InvitationOperation =
  | 'issuing'
  | 'reading'
  | 'reissuing'
  | 'revoking'
  | 'retrying-revoke'
  | null;

class InvitationRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null = null,
  ) {
    super('invitation_request_failed');
  }
}

function errorMessage(error: unknown, mutating: boolean): string {
  if (error instanceof InvitationRequestError) {
    switch (error.status) {
      case 401:
        return 'Your session expired. Sign in again.';
      case 403:
        return 'You do not have permission for this operation.';
      case 404:
        return 'This invitation is unavailable.';
      case 409:
        return 'This request conflicts with an earlier operation.';
      case 400:
      case 422:
        return 'The invitation details could not be accepted.';
      case 429: {
        const seconds = error.retryAfter;
        if (
          seconds &&
          /^\d+$/.test(seconds) &&
          Number.isSafeInteger(Number(seconds))
        ) {
          return `Too many operations. Try again in ${seconds} seconds.`;
        }
        return 'Too many operations. Try again later.';
      }
      case 503:
        return mutating
          ? 'Invitation administration is unavailable. The outcome may be unknown.'
          : 'Invitation administration is unavailable.';
    }
  }
  return mutating
    ? 'The invitation outcome is unknown. Retry the same invitation to recover its result.'
    : 'The invitation state could not be loaded.';
}

function issueButtonLabel(
  operation: InvitationOperation,
  attempt: InvitationAttempt | null,
): string {
  if (operation === 'issuing') return 'Sending invitation...';
  if (attempt) return 'Retry invitation';
  return 'Send invitation';
}

function mutationButtonLabel(
  action: 'reissue' | 'revoke' | 'retry-revoke',
  operation: InvitationOperation,
  attempt: InvitationAttempt | null,
): string {
  if (action === 'reissue' && operation === 'reissuing') return 'Reissuing...';
  if (action === 'revoke' && operation === 'revoking') return 'Revoking...';
  if (action === 'retry-revoke' && operation === 'retrying-revoke')
    return 'Retrying revocation...';
  if (attempt?.action === action && attempt.outcome !== 'completed')
    return action === 'reissue'
      ? 'Retry reissue'
      : action === 'revoke'
        ? 'Retry revoke'
        : 'Retry revocation';
  return action === 'reissue'
    ? 'Reissue invitation'
    : action === 'revoke'
      ? 'Revoke invitation'
      : 'Retry revocation';
}

function mutationButtonDisabled(
  action: 'reissue' | 'revoke' | 'retry-revoke',
  operation: InvitationOperation,
  attempt: InvitationAttempt | null,
): boolean {
  if (operation) return true;
  return attempt?.outcome === 'unknown' && attempt.action !== action;
}

function InvitationConsole({
  getToken,
  returnUrl,
  requestTimeoutMillis,
}: Readonly<{
  getToken: () => Promise<string | null>;
  returnUrl: string;
  requestTimeoutMillis: number;
}>) {
  const [destinationEmail, setDestinationEmail] = useState('');
  const [reason, setReason] = useState('');
  const [mutationReason, setMutationReason] = useState('');
  const [invitationId, setInvitationId] = useState('');
  const [attempt, setAttempt] = useState<InvitationAttempt | null>(null);
  const [mutationAttempt, setMutationAttempt] =
    useState<InvitationAttempt | null>(null);
  const [operation, setOperation] = useState<InvitationOperation>(null);
  const [result, setResult] = useState<BootstrapInvitationState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      const controller = activeRequest.current;
      activeRequest.current = null;
      controller?.abort();
    },
    [],
  );

  async function request(
    currentAttempt: InvitationAttempt | null,
    requestedId?: string,
  ) {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMillis);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    });
    const bounded = <Value,>(pending: Promise<Value>) =>
      Promise.race([pending, aborted]);
    if (!currentAttempt) setOperation('reading');
    else if (currentAttempt.action === 'issue') setOperation('issuing');
    else if (currentAttempt.action === 'reissue') setOperation('reissuing');
    else if (currentAttempt.action === 'revoke') setOperation('revoking');
    else setOperation('retrying-revoke');
    setMessage(null);
    try {
      const token = await bounded(getToken());
      controller.signal.throwIfAborted();
      if (!token) throw new InvitationRequestError(401);
      const headers = new Headers({ Authorization: `Bearer ${token}` });
      if (currentAttempt) {
        headers.set('Content-Type', 'application/json');
        headers.set('Idempotency-Key', currentAttempt.key);
      }
      let path = `/api/platform/invitations/${requestedId}`;
      if (currentAttempt?.action === 'issue')
        path = '/api/platform/invitations';
      else if (currentAttempt) {
        const command =
          currentAttempt.action === 'retry-revoke'
            ? 'revoke/retry'
            : currentAttempt.action;
        path = `/api/platform/invitations/${currentAttempt.invitationId}/${command}`;
      }
      const response = await bounded(
        fetch(path, {
          method: currentAttempt ? 'POST' : 'GET',
          headers,
          ...(currentAttempt
            ? { body: JSON.stringify(currentAttempt.input) }
            : {}),
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
        }),
      );
      controller.signal.throwIfAborted();
      if (!response.ok)
        throw new InvitationRequestError(
          response.status,
          response.headers.get('retry-after'),
        );
      const state = parseBootstrapInvitationState(
        await bounded(response.json()),
      );
      controller.signal.throwIfAborted();
      if (
        !state ||
        (!currentAttempt &&
          state.invitationId.toLowerCase() !== requestedId?.toLowerCase())
      )
        throw new Error('Invalid invitation state');
      setResult(state);
      setInvitationId(state.invitationId);
      if (currentAttempt?.action === 'issue')
        setAttempt({ ...currentAttempt, outcome: 'completed' });
      if (currentAttempt?.action !== 'issue' && currentAttempt)
        setMutationAttempt({ ...currentAttempt, outcome: 'completed' });
    } catch (error) {
      if (activeRequest.current !== controller) return;
      if (
        currentAttempt &&
        error instanceof InvitationRequestError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        const rejected = { ...currentAttempt, outcome: 'rejected' as const };
        if (currentAttempt.action === 'issue') setAttempt(rejected);
        else setMutationAttempt(rejected);
      }
      setMessage(errorMessage(error, Boolean(currentAttempt)));
      if (error instanceof InvitationRequestError && error.status === 401)
        setSessionExpired(true);
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setOperation(null);
      }
    }
  }

  function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current || attempt?.outcome === 'completed') return;
    const input = {
      destinationEmail: destinationEmail.trim().toLowerCase(),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    if (!input.destinationEmail) {
      setMessage('Enter an email.');
      return;
    }
    const currentAttempt: InvitationAttempt = {
      ...(attempt ?? { action: 'issue', input, key: crypto.randomUUID() }),
      outcome: 'unknown',
    };
    setAttempt(currentAttempt);
    setResult(null);
    void request(currentAttempt);
  }

  function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current) return;
    const requestedId = invitationId.trim();
    if (!invitationUuid.test(requestedId)) {
      setMessage('Enter a valid invitation ID.');
      return;
    }
    setResult(null);
    void request(null, requestedId);
  }

  function mutate(action: 'reissue' | 'revoke' | 'retry-revoke') {
    if (activeRequest.current) return;
    const targetId = result?.invitationId ?? invitationId.trim();
    const trimmedReason = mutationReason.trim();
    if (!invitationUuid.test(targetId)) {
      setMessage('Load a valid invitation before changing it.');
      return;
    }
    if (!trimmedReason) {
      setMessage('Enter a reason for this invitation change.');
      return;
    }
    const previousAttempt =
      mutationAttempt?.action === action &&
      mutationAttempt.outcome === 'unknown' &&
      mutationAttempt.invitationId?.toLowerCase() === targetId.toLowerCase()
        ? mutationAttempt
        : null;
    const currentAttempt: InvitationAttempt = {
      ...(previousAttempt ?? {
        action,
        invitationId: targetId,
        input: { reason: trimmedReason },
        key: crypto.randomUUID(),
      }),
      outcome: 'unknown',
    };
    setMutationAttempt(currentAttempt);
    void request(currentAttempt);
  }

  if (sessionExpired)
    return <RedirectToSignIn signInForceRedirectUrl={returnUrl} />;
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <p className={styles.brand}>BlueCurrent | Platform</p>
        <h1>Bootstrap invitations</h1>
      </header>
      {message ? <Notice role="alert">{message}</Notice> : null}
      <div className={styles.workspace}>
        <section className={styles.section} aria-labelledby="issue-title">
          <h2 id="issue-title">New invitation</h2>
          <form
            className={styles.form}
            onSubmit={issue}
            aria-label="Issue invitation"
            aria-busy={operation === 'issuing'}
          >
            <label className={styles.field} htmlFor="invitation-email">
              <span className={styles.label}>Destination email</span>
              <Input
                id="invitation-email"
                type="email"
                autoComplete="off"
                required
                value={destinationEmail}
                readOnly={Boolean(attempt) || Boolean(operation)}
                onChange={(event) => setDestinationEmail(event.target.value)}
              />
            </label>
            <label className={styles.field} htmlFor="invitation-reason">
              <span className={styles.label}>Reason</span>
              <Input
                id="invitation-reason"
                value={reason}
                readOnly={Boolean(attempt) || Boolean(operation)}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className={styles.actions}>
              <Button
                type="submit"
                disabled={
                  Boolean(operation) || attempt?.outcome === 'completed'
                }
              >
                {issueButtonLabel(operation, attempt)}
              </Button>
              {attempt && attempt.outcome !== 'unknown' ? (
                <Button
                  variant="secondary"
                  disabled={Boolean(operation)}
                  onClick={() => {
                    setAttempt(null);
                    setDestinationEmail('');
                    setReason('');
                    setMutationAttempt(null);
                    setMutationReason('');
                    setMessage(null);
                  }}
                >
                  New invitation
                </Button>
              ) : null}
            </div>
          </form>
        </section>
        <section className={styles.section} aria-labelledby="read-title">
          <h2 id="read-title">Invitation state</h2>
          <form
            className={styles.form}
            onSubmit={read}
            aria-label="Read invitation"
            aria-busy={operation === 'reading'}
          >
            <label className={styles.field} htmlFor="invitation-id">
              <span className={styles.label}>Invitation ID</span>
              <Input
                id="invitation-id"
                required
                value={invitationId}
                readOnly={Boolean(operation)}
                onChange={(event) => {
                  if (activeRequest.current) return;
                  setInvitationId(event.target.value);
                  setResult(null);
                }}
              />
            </label>
            <Button
              type="submit"
              variant="secondary"
              disabled={Boolean(operation)}
            >
              {operation === 'reading' ? 'Loading state...' : 'Update state'}
            </Button>
          </form>
          {result ? <InvitationResult result={result} /> : null}
          {result?.status === 'issued' ||
          (result?.status === 'revoked' &&
            result.deliveryStatus === 'dead_letter') ? (
            <div className={styles.actions}>
              <label className={styles.field} htmlFor="mutation-reason">
                <span className={styles.label}>
                  {result.status === 'revoked'
                    ? 'Recovery reason'
                    : 'Change reason'}
                </span>
                <Input
                  id="mutation-reason"
                  required
                  value={mutationReason}
                  readOnly={
                    mutationAttempt?.outcome === 'unknown' || Boolean(operation)
                  }
                  onChange={(event) => setMutationReason(event.target.value)}
                />
              </label>
              {result.status === 'issued' ? (
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={mutationButtonDisabled(
                      'reissue',
                      operation,
                      mutationAttempt,
                    )}
                    onClick={() => mutate('reissue')}
                  >
                    {mutationButtonLabel('reissue', operation, mutationAttempt)}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={mutationButtonDisabled(
                      'revoke',
                      operation,
                      mutationAttempt,
                    )}
                    onClick={() => mutate('revoke')}
                  >
                    {mutationButtonLabel('revoke', operation, mutationAttempt)}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={mutationButtonDisabled(
                    'retry-revoke',
                    operation,
                    mutationAttempt,
                  )}
                  onClick={() => mutate('retry-revoke')}
                >
                  {mutationButtonLabel(
                    'retry-revoke',
                    operation,
                    mutationAttempt,
                  )}
                </Button>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

const grantLabels: Record<BootstrapInvitationState['status'], string> = {
  issued: 'Issued',
  consumed: 'Consumed',
  revoked: 'Revoked',
  expired: 'Expired',
  superseded: 'Superseded',
};
const deliveryLabels: Record<
  BootstrapInvitationState['deliveryStatus'],
  string
> = {
  pending: 'Pending processing',
  retrying: 'Retrying',
  succeeded: 'Processed',
  dead_letter: 'Processing failed',
};

function InvitationResult({ result }: { result: BootstrapInvitationState }) {
  return (
    <div role="status">
      <dl className={styles.result} aria-label="Invitation result">
        <div>
          <dt className={styles.resultLabel}>Invitation ID</dt>
          <dd>{result.invitationId}</dd>
        </div>
        <div>
          <dt className={styles.resultLabel}>Destination email</dt>
          <dd>{result.destinationEmail}</dd>
        </div>
        <div>
          <dt className={styles.resultLabel}>Invitation</dt>
          <dd>{grantLabels[result.status]}</dd>
        </div>
        <div>
          <dt className={styles.resultLabel}>Delivery processing</dt>
          <dd>{deliveryLabels[result.deliveryStatus]}</dd>
        </div>
        {result.issuedAt ? (
          <div>
            <dt className={styles.resultLabel}>Issued at</dt>
            <dd>
              <time dateTime={result.issuedAt}>
                {new Date(result.issuedAt).toLocaleString()}
              </time>
            </dd>
          </div>
        ) : null}
        {result.expiresAt ? (
          <div>
            <dt className={styles.resultLabel}>Expires at</dt>
            <dd>
              <time dateTime={result.expiresAt}>
                {new Date(result.expiresAt).toLocaleString()}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
