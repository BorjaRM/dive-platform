import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { bootstrapRoles, migrateProduct } from '@dive-center/database';
import {
  IDENTITY_PROVIDER,
  type IdentityProviderPort,
} from '@dive-center/identity';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { type Browser, chromium } from 'playwright';
import request from 'supertest';
import { AppModule } from '../src/app/app.module.js';
import { clerkIdentityConfigFromEnvironment } from '../src/common/auth/clerk.config.js';
import { createClerkBrowserSession } from './clerk.browser-session.js';
import { legacyDashboardCenterPath } from './legacy-dashboard-routes.js';

const REVOCATION_REQUIREMENT_MS = 5 * 60 * 1_000;
const REAL_RUN_FLAG = 'DIVE_REAL_CLERK_E2E';
const EXPECTED_SCENARIOS = 2;

type SandboxConfig = Readonly<{
  clerk: ReturnType<typeof clerkIdentityConfigFromEnvironment>;
  accountPortalUrl: string;
  migrationDatabaseUrl: string;
  adminDatabaseUrl: string;
  appDatabaseUrl: string;
  userId: string;
  userPassword: string;
  controlUserId: string;
  controlUserPassword: string;
}>;

type SandboxFixture = Readonly<{
  tenantId: string;
  centerId: string;
  identityId: string;
  controlIdentityId: string;
  membershipId: string;
}>;

type SandboxSession = {
  userId: string;
  id: string;
  token: string;
  sessionIdHash: string;
  revoked: boolean;
};

type SafeObservation = Readonly<{
  scenario: 'REAL-AUTH' | 'REAL-SESSION-REVOKE';
  monotonicMs: number;
  statusCode: number;
  sessionIdHash: string;
  result: string;
  elapsedMs?: number;
  attempts?: number;
}>;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sandboxDatabaseUrl(name: string, expectedUsername: string): string {
  const value = requiredEnvironment(name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}`);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55432' ||
    url.pathname !== '/dive_spike' ||
    decodeURIComponent(url.username) !== expectedUsername ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must target the local dive_spike sandbox database on port 55432`,
    );
  }
  return value;
}

function canonicalHttpsOrigin(name: string): string {
  const value = requiredEnvironment(name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.origin !== value
  ) {
    throw new Error(`${name} must be a canonical HTTPS origin`);
  }
  return value;
}

function loadSandboxConfig(): SandboxConfig {
  if (process.env[REAL_RUN_FLAG] !== '1') {
    throw new Error(
      `Refusing real Clerk sandbox evidence. Set ${REAL_RUN_FLAG}=1 only for the explicit sandbox command.`,
    );
  }

  const environment = process.env;
  const clerk = clerkIdentityConfigFromEnvironment(environment);
  if (!clerk.secretKey.startsWith('sk_test_')) {
    throw new Error(
      'Refusing Clerk sandbox evidence with a non-test secret key; use a sk_test_ key.',
    );
  }
  const accountPortalUrl = canonicalHttpsOrigin(
    'DIVE_CLERK_SANDBOX_ACCOUNT_PORTAL_URL',
  );
  if (!clerk.authorizedParties.includes(accountPortalUrl)) {
    throw new Error(
      'DIVE_CLERK_SANDBOX_ACCOUNT_PORTAL_URL must be included in CLERK_AUTHORIZED_PARTIES',
    );
  }
  return Object.freeze({
    clerk,
    accountPortalUrl,
    migrationDatabaseUrl: sandboxDatabaseUrl(
      'MIGRATION_DATABASE_URL',
      'dive_migration',
    ),
    adminDatabaseUrl: sandboxDatabaseUrl(
      'SPIKE_ADMIN_DATABASE_URL',
      'postgres',
    ),
    appDatabaseUrl: sandboxDatabaseUrl('SPIKE_APP_DATABASE_URL', 'dive_app'),
    userId: requiredEnvironment('DIVE_CLERK_SANDBOX_USER_ID'),
    userPassword: requiredEnvironment('DIVE_CLERK_SANDBOX_USER_PASSWORD'),
    controlUserId: requiredEnvironment('DIVE_CLERK_SANDBOX_CONTROL_USER_ID'),
    controlUserPassword: requiredEnvironment(
      'DIVE_CLERK_SANDBOX_CONTROL_USER_PASSWORD',
    ),
  });
}

function sessionIdHash(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

function monotonicMs(): number {
  return performance.now();
}

function fixtureIds(): SandboxFixture {
  return Object.freeze({
    tenantId: randomUUID(),
    centerId: randomUUID(),
    identityId: randomUUID(),
    controlIdentityId: randomUUID(),
    membershipId: randomUUID(),
  });
}

async function centerRequest(
  app: INestApplication,
  fixture: SandboxFixture,
  token: string,
): Promise<number> {
  const response = await request(app.getHttpServer())
    .get(legacyDashboardCenterPath(fixture.tenantId, fixture.centerId))
    .set('authorization', `Bearer ${token}`);
  return response.status;
}

describe('Clerk sandbox evidence (REAL-AUTH, REAL-SESSION-REVOKE)', () => {
  let config: SandboxConfig;
  let admin: Pool;
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let clerk: ReturnType<typeof createClerkClient>;
  let browser: Browser;
  let identityProvider: IdentityProviderPort;
  let fixture: SandboxFixture | undefined;
  const sessions: SandboxSession[] = [];
  const observations: SafeObservation[] = [];
  let completedScenarios = 0;

  async function primaryEmailForUser(userId: string): Promise<string> {
    const user = await clerk.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    )?.emailAddress;
    if (!primaryEmail) {
      throw new Error(`Clerk user ${userId} has no primary email address`);
    }
    return primaryEmail;
  }

  async function createSandboxSession(
    userId: string,
    password: string,
  ): Promise<SandboxSession> {
    const browserSession = await createClerkBrowserSession({
      browser,
      accountPortalUrl: config.accountPortalUrl,
      email: await primaryEmailForUser(userId),
      password,
    });
    let sandboxSession: SandboxSession | undefined;
    try {
      sandboxSession = {
        userId,
        id: browserSession.id,
        token: browserSession.token,
        sessionIdHash: sessionIdHash(browserSession.id),
        revoked: false,
      };
      sessions.push(sandboxSession);

      await validateProductionTokenProfile(sandboxSession);
      return sandboxSession;
    } finally {
      if (!sandboxSession) {
        await clerk.sessions.revokeSession(browserSession.id);
      }
    }
  }

  async function validateProductionTokenProfile(
    session: SandboxSession,
  ): Promise<void> {
    let claims: unknown;
    try {
      claims = await verifyToken(session.token, {
        secretKey: config.clerk.secretKey,
        authorizedParties: [...config.clerk.authorizedParties],
      });
    } catch {
      throw new Error(
        'Clerk sandbox SDK token could not be verified with the production token profile.',
      );
    }

    const claimRecord = claims as Record<string, unknown>;
    const azp = claimRecord.azp;
    if (
      claimRecord.iss !== config.clerk.issuer ||
      claimRecord.sub !== session.userId ||
      claimRecord.sid !== session.id ||
      typeof azp !== 'string' ||
      !config.clerk.authorizedParties.includes(azp) ||
      'aud' in claimRecord
    ) {
      throw new Error(
        'Clerk sandbox token does not match the production adapter profile: exact issuer, approved azp, audience-free claims, sub, and sid are required.',
      );
    }

    try {
      await identityProvider.authenticate(session.token);
    } catch {
      throw new Error(
        'Clerk sandbox token was rejected by the production ClerkIdentityAdapter; the adapter was not relaxed.',
      );
    }
  }

  async function insertFixtures(nextFixture: SandboxFixture): Promise<void> {
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'Clerk sandbox tenant')`,
        [nextFixture.tenantId],
      );
      await client.query(
        `INSERT INTO iam_app.identities(id) VALUES ($1),($2)`,
        [nextFixture.identityId, nextFixture.controlIdentityId],
      );
      await client.query(
        `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
         VALUES ($1,$3,$4),($2,$3,$5)`,
        [
          nextFixture.identityId,
          nextFixture.controlIdentityId,
          config.clerk.issuer,
          config.userId,
          config.controlUserId,
        ],
      );
      await client.query(
        `INSERT INTO iam_app.centers(id,tenant_id,name) VALUES ($1,$2,'Clerk sandbox center')`,
        [nextFixture.centerId, nextFixture.tenantId],
      );
      await client.query(
        `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
         VALUES ($1,$2,$3,'active',ARRAY['tenant_owner'],NULL)`,
        [
          nextFixture.membershipId,
          nextFixture.tenantId,
          nextFixture.identityId,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function deleteFixtures(currentFixture: SandboxFixture): Promise<void> {
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM iam_app.audit_records WHERE tenant_id = $1`,
        [currentFixture.tenantId],
      );
      await client.query(
        `DELETE FROM iam_app.outbox_events WHERE tenant_id = $1`,
        [currentFixture.tenantId],
      );
      await client.query(
        `DELETE FROM iam_app.memberships WHERE tenant_id = $1`,
        [currentFixture.tenantId],
      );
      await client.query(
        `DELETE FROM iam_app.identity_tenants WHERE identity_id IN ($1,$2)`,
        [currentFixture.identityId, currentFixture.controlIdentityId],
      );
      await client.query(
        `DELETE FROM iam_app.external_identities WHERE identity_id IN ($1,$2)`,
        [currentFixture.identityId, currentFixture.controlIdentityId],
      );
      await client.query(`DELETE FROM iam_app.centers WHERE tenant_id = $1`, [
        currentFixture.tenantId,
      ]);
      await client.query(`DELETE FROM iam_app.identities WHERE id IN ($1,$2)`, [
        currentFixture.identityId,
        currentFixture.controlIdentityId,
      ]);
      await client.query(`DELETE FROM iam_app.tenants WHERE id = $1`, [
        currentFixture.tenantId,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  function observe(observation: Omit<SafeObservation, 'monotonicMs'>): void {
    observations.push({ monotonicMs: monotonicMs(), ...observation });
  }

  beforeAll(async () => {
    config = loadSandboxConfig();
    process.env.APP_DATABASE_URL = config.appDatabaseUrl;
    browser = await chromium.launch();
    admin = new Pool({ connectionString: config.adminDatabaseUrl });
    await bootstrapRoles(admin);
    await migrateProduct(undefined, config.migrationDatabaseUrl);

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    clerk = createClerkClient({ secretKey: config.clerk.secretKey });
    identityProvider =
      moduleFixture.get<IdentityProviderPort>(IDENTITY_PROVIDER);
  });

  beforeEach(async () => {
    fixture = fixtureIds();
    await insertFixtures(fixture);
  });

  afterEach(async () => {
    const sessionsToRevoke = sessions.splice(0);
    const currentFixture = fixture;
    fixture = undefined;
    let cleanupError: unknown;
    try {
      for (const session of sessionsToRevoke) {
        if (!session.revoked) {
          try {
            await clerk.sessions.revokeSession(session.id);
            session.revoked = true;
          } catch (error) {
            cleanupError ??= error;
          }
        }
      }
    } finally {
      if (currentFixture) {
        try {
          await deleteFixtures(currentFixture);
        } catch (error) {
          cleanupError ??= error;
        }
      }
    }
    if (cleanupError) {
      throw cleanupError;
    }
  });

  afterAll(async () => {
    if (completedScenarios === EXPECTED_SCENARIOS) {
      console.info(
        JSON.stringify({
          harness: 'clerk-sandbox',
          observations,
          blocked: [
            'browser logout',
            'natural expiry',
            'Clerk-delivered webhook',
            'production traffic',
          ],
        }),
      );
    }
    await app?.close();
    await moduleFixture?.close();
    await browser?.close();
    await admin?.end();
  });

  it('REAL-AUTH authorizes the fixture member and denies the control user', async () => {
    const currentFixture = fixture;
    if (!currentFixture) throw new Error('Sandbox fixture was not prepared');

    const authorizedSession = await createSandboxSession(
      config.userId,
      config.userPassword,
    );
    const authorizedStatus = await centerRequest(
      app,
      currentFixture,
      authorizedSession.token,
    );
    expect(authorizedStatus).toBe(200);
    observe({
      scenario: 'REAL-AUTH',
      statusCode: authorizedStatus,
      sessionIdHash: authorizedSession.sessionIdHash,
      result: 'authorized_fixture_member',
    });

    const controlSession = await createSandboxSession(
      config.controlUserId,
      config.controlUserPassword,
    );
    const controlStatus = await centerRequest(
      app,
      currentFixture,
      controlSession.token,
    );
    expect(controlStatus).toBe(403);
    observe({
      scenario: 'REAL-AUTH',
      statusCode: controlStatus,
      sessionIdHash: controlSession.sessionIdHash,
      result: 'authenticated_without_membership',
    });
    completedScenarios += 1;
  });

  it('REAL-SESSION-REVOKE denies the first request after Clerk revocation', async () => {
    const currentFixture = fixture;
    if (!currentFixture) throw new Error('Sandbox fixture was not prepared');

    const session = await createSandboxSession(
      config.userId,
      config.userPassword,
    );
    const controlSession = await createSandboxSession(
      config.controlUserId,
      config.controlUserPassword,
    );
    const authorizedStatus = await centerRequest(
      app,
      currentFixture,
      session.token,
    );
    expect(authorizedStatus).toBe(200);
    expect(await centerRequest(app, currentFixture, controlSession.token)).toBe(
      403,
    );
    observe({
      scenario: 'REAL-SESSION-REVOKE',
      statusCode: authorizedStatus,
      sessionIdHash: session.sessionIdHash,
      result: 'authorized_before_revocation',
    });

    const revokedAt = monotonicMs();
    const revokedSession = await clerk.sessions.revokeSession(session.id);
    session.revoked = true;
    if (revokedSession.status !== 'revoked') {
      throw new Error(
        'Clerk did not report the session as revoked; no denial measurement was recorded.',
      );
    }

    const statusCodesSeen = new Set<number>();
    let firstDeniedAt: number | undefined;
    let attempts = 0;
    let retryDelayMs = 100;
    while (monotonicMs() - revokedAt <= REVOCATION_REQUIREMENT_MS) {
      attempts += 1;
      const statusCode = await centerRequest(
        app,
        currentFixture,
        session.token,
      );
      statusCodesSeen.add(statusCode);
      if (statusCode === 401) {
        const providerSession = await clerk.sessions.getSession(session.id);
        if (providerSession.status !== 'revoked') {
          throw new Error(
            'The provider session was not reported as revoked; no denial measurement was recorded.',
          );
        }
        const controlStatus = await centerRequest(
          app,
          currentFixture,
          controlSession.token,
        );
        if (controlStatus !== 403) {
          throw new Error(
            `The active control session did not remain healthy: ${controlStatus}`,
          );
        }
        firstDeniedAt = monotonicMs();
        break;
      }
      if (statusCode !== 200) {
        throw new Error(
          `Unexpected status after Clerk revocation: ${statusCode}`,
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      retryDelayMs = Math.min(retryDelayMs * 2, 5_000);
    }

    expect(firstDeniedAt).toBeDefined();
    if (firstDeniedAt === undefined) {
      throw new Error('Clerk session was not denied after revocation');
    }
    expect(firstDeniedAt - revokedAt).toBeLessThanOrEqual(
      REVOCATION_REQUIREMENT_MS,
    );
    expect([...statusCodesSeen]).toEqual(expect.arrayContaining([401]));
    observe({
      scenario: 'REAL-SESSION-REVOKE',
      statusCode: 401,
      sessionIdHash: session.sessionIdHash,
      result: 'denied_after_revocation',
      elapsedMs: firstDeniedAt - revokedAt,
      attempts,
    });
    completedScenarios += 1;
  });
});
