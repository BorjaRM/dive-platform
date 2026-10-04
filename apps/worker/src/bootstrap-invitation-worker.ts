import {
  claimBootstrapOutboxEvent,
  completeBootstrapOutboxEvent,
  failBootstrapOutboxEvent,
} from '@dive-center/database';
import {
  BootstrapInvitationProviderError,
  type BootstrapInvitationProviderPort,
  type BootstrapInvitationProviderResult,
} from '@dive-center/identity';
import type { Pool, PoolClient } from 'pg';

export type BootstrapWorkerResult =
  | 'ambiguous_timeout'
  | 'dead_letter'
  | 'disabled'
  | 'idle'
  | 'retrying'
  | 'succeeded';

type WorkerDependencies = Readonly<{
  now: () => Date;
  random: () => number;
}>;

const defaultDependencies: WorkerDependencies = {
  now: () => new Date(),
  random: Math.random,
};

export function bootstrapInvitationDeliveryEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.BOOTSTRAP_INVITATION_DELIVERY_ENABLED === 'true';
}

export function assertBootstrapWorkerRollout(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (
    bootstrapInvitationDeliveryEnabled(environment) &&
    environment.BOOTSTRAP_INVITATION_WRITES_ENABLED !== 'true'
  ) {
    throw new Error(
      'BOOTSTRAP_INVITATION_DELIVERY_ENABLED requires BOOTSTRAP_INVITATION_WRITES_ENABLED',
    );
  }
}

export function fullJitterDelayMillis(
  attempt: number,
  random: () => number = Math.random,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 8) {
    throw new Error('Invalid bootstrap delivery attempt');
  }
  const ceiling = Math.min(5_000 * 2 ** (attempt - 1), 15 * 60_000);
  const sample = random();
  if (sample < 0 || sample >= 1) throw new Error('Invalid random sample');
  return Math.floor(sample * (ceiling + 1));
}

export function retryAfterDelayMillis(
  value: string | null,
  now: Date,
): number | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const delay = Number(normalized) * 1_000;
    return Number.isSafeInteger(delay) ? delay : Number.POSITIVE_INFINITY;
  }
  const timestamp = parseHttpDateTimestamp(normalized);
  const delay = timestamp - now.getTime();
  if (!Number.isFinite(timestamp) || delay <= 0) return null;
  return Number.isSafeInteger(delay) ? delay : Number.POSITIVE_INFINITY;
}

const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const longWeekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseHttpDateTimestamp(value: string): number {
  const imfFixdate =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value,
    );
  if (imfFixdate) {
    const [
      ,
      weekday = '',
      day = '',
      month = '',
      year = '',
      hour = '',
      minute = '',
      second = '',
    ] = imfFixdate;
    return validatedHttpDateTimestamp(
      weekday,
      day,
      month,
      year,
      hour,
      minute,
      second,
    );
  }

  const rfc850Date =
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value,
    );
  if (rfc850Date) {
    const [
      ,
      weekday = '',
      day = '',
      month = '',
      shortYearValue = '',
      hour = '',
      minute = '',
      second = '',
    ] = rfc850Date;
    const shortYear = Number(shortYearValue);
    return validatedHttpDateTimestamp(
      weekday,
      day,
      month,
      String(shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear),
      hour,
      minute,
      second,
    );
  }

  const asctimeDate =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ 0-9]{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
      value,
    );
  if (asctimeDate) {
    const [
      ,
      weekday = '',
      month = '',
      day = '',
      hour = '',
      minute = '',
      second = '',
      year = '',
    ] = asctimeDate;
    return validatedHttpDateTimestamp(
      weekday,
      day,
      month,
      year,
      hour,
      minute,
      second,
    );
  }

  return Number.NaN;
}

function validatedHttpDateTimestamp(
  weekday: string,
  day: string,
  month: string,
  year: string,
  hour: string,
  minute: string,
  second: string,
): number {
  const yearNumber = Number(year);
  const monthIndex = months.indexOf(month);
  const dayNumber = Number(day.trim());
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  if (
    monthIndex < 0 ||
    dayNumber < 1 ||
    dayNumber > 31 ||
    hourNumber > 23 ||
    minuteNumber > 59 ||
    secondNumber > 59
  ) {
    return Number.NaN;
  }

  const timestamp = Date.UTC(
    yearNumber,
    monthIndex,
    dayNumber,
    hourNumber,
    minuteNumber,
    secondNumber,
  );
  const date = new Date(timestamp);
  if (yearNumber >= 0 && yearNumber <= 99) {
    date.setUTCFullYear(yearNumber);
  }
  const expectedWeekdayName = longWeekdays.includes(weekday)
    ? (shortWeekdays[longWeekdays.indexOf(weekday)] ?? '')
    : weekday;
  const expectedWeekday = shortWeekdays.indexOf(expectedWeekdayName);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== yearNumber ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== dayNumber ||
    date.getUTCHours() !== hourNumber ||
    date.getUTCMinutes() !== minuteNumber ||
    date.getUTCSeconds() !== secondNumber ||
    date.getUTCDay() !== expectedWeekday
  ) {
    return Number.NaN;
  }
  return date.getTime();
}

function isRetryable(error: BootstrapInvitationProviderError): boolean {
  return (
    error.statusCode === null ||
    error.statusCode === 408 ||
    error.statusCode === 429 ||
    (error.statusCode >= 500 && error.statusCode <= 599)
  );
}

function safeProviderStatus(error: BootstrapInvitationProviderError): string {
  if (error.name === 'UnknownProviderStateError') {
    return 'unknown_provider_state';
  }
  if (error.timedOut) return 'request_timeout';
  return error.statusCode === null
    ? 'network_error'
    : `http_${error.statusCode}`;
}

function unknownProviderStateError(): BootstrapInvitationProviderError {
  const error = new BootstrapInvitationProviderError(null, null);
  error.name = 'UnknownProviderStateError';
  return error;
}

async function deliver(
  provider: BootstrapInvitationProviderPort,
  claim: NonNullable<Awaited<ReturnType<typeof claimBootstrapOutboxEvent>>>,
): Promise<BootstrapInvitationProviderResult | null> {
  if (claim.command === 'create') {
    const reconciled = await provider.reconcile({
      destinationEmail: claim.destinationEmail,
      grantRef: claim.grantId,
    });
    if (reconciled) return reconciled;
    return provider.create({
      destinationEmail: claim.destinationEmail,
      grantRef: claim.grantId,
    });
  }

  const reconciled = await provider.reconcile({
    destinationEmail: claim.destinationEmail,
    grantRef: claim.grantId,
  });
  if (!reconciled) return null;
  if (reconciled.status === 'revoked' || reconciled.status === 'not_found') {
    return Object.freeze({
      invitationRef: reconciled.invitationRef,
      status: 'not_found',
    });
  }
  if (reconciled.status !== 'pending') {
    throw unknownProviderStateError();
  }
  return provider.revoke(reconciled.invitationRef);
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}

export async function processNextBootstrapInvitation(
  pool: Pool,
  provider: BootstrapInvitationProviderPort,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: WorkerDependencies = defaultDependencies,
): Promise<BootstrapWorkerResult> {
  assertBootstrapWorkerRollout(environment);
  if (!bootstrapInvitationDeliveryEnabled(environment)) return 'disabled';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claim = await claimBootstrapOutboxEvent(client);
    if (!claim) {
      await client.query('COMMIT');
      return 'idle';
    }

    try {
      const delivered = await deliver(provider, claim);
      await completeBootstrapOutboxEvent(client, {
        eventId: claim.eventId,
        providerInvitationRef: delivered?.invitationRef ?? null,
        providerStatus: delivered?.status ?? 'not_found',
      });
      await client.query('COMMIT');
      return 'succeeded';
    } catch (error) {
      if (!(error instanceof BootstrapInvitationProviderError)) throw error;
      const retryable = isRetryable(error);
      const attempt = claim.attemptCount + 1;
      let nextAttemptAt: string | null = null;
      let providerStatus = safeProviderStatus(error);
      if (retryable && attempt < 8) {
        const now = dependencies.now();
        const localDelay = fullJitterDelayMillis(attempt, dependencies.random);
        const providerDelay =
          error.statusCode === 429
            ? retryAfterDelayMillis(error.retryAfter, now)
            : null;
        const retryAt = new Date(
          now.getTime() + Math.max(localDelay, providerDelay ?? localDelay),
        );
        if (!Number.isFinite(retryAt.getTime())) {
          nextAttemptAt = 'infinity';
          providerStatus = 'retry_after_out_of_range';
        } else {
          nextAttemptAt = retryAt.toISOString();
        }
      }
      const state = await failBootstrapOutboxEvent(client, {
        eventId: claim.eventId,
        retryable,
        nextAttemptAt,
        providerStatus,
      });
      await client.query('COMMIT');
      if (error.timedOut) return 'ambiguous_timeout';
      return state;
    }
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
}
