import { createClerkClient } from '@clerk/backend';
import { parsePublishableKey } from '@clerk/shared/keys';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from 'playwright';
import { startClerkInvitationProbe } from './clerk-invitation-probe.js';

const REAL_RUN_FLAG = 'DIVE_REAL_CLERK_INVITATION_E2E';
const LOCAL_TEST_PUBLISHABLE_KEY = //gitleaks:allow
  'pk_test_bG9jYWwuY2xlcmsuYWNjb3VudHMuZGV2JA==';

type InvitationSandboxConfig = Readonly<{
  secretKey: string;
  publishableKey: string;
  accountPortalUrl: string;
  existingUserId: string;
  existingUserPassword: string;
  controlUserId: string;
  controlUserPassword: string;
  newUserEmail: string;
  newUserPassword: string;
}>;

type SafeObservation = Readonly<{
  scenario:
    | 'IGNORE-EXISTING-FALSE'
    | 'IGNORE-EXISTING-TRUE'
    | 'INVITE-ONLY'
    | 'NEW-IDENTITY'
    | 'EXISTING-NO-SESSION'
    | 'MATCHING-SESSION'
    | 'DIFFERENT-SESSION'
    | 'REVOKE-REISSUE';
  result: string;
  clerkStatus?: string | null;
  providerCode?: string | null;
  signedIn?: boolean;
  ticketRemoved?: boolean;
}>;

type ProbeState = Readonly<{
  phase: string;
  clerkStatus: string | null;
  providerCode: string | null;
  signedIn: boolean;
}>;

type BrowserSecurityObservation = {
  ticketOutsideAcceptance: boolean;
  ticketInReferrer: boolean;
  ticketInBrowserOutput: boolean;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function canonicalClerkDevelopmentOrigin(name: string): string {
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
    !url.hostname.endsWith('.accounts.dev') ||
    url.origin !== value
  ) {
    throw new Error(`${name} must be a canonical Clerk Development origin`);
  }
  return value;
}

function loadInvitationSandboxConfig(): InvitationSandboxConfig {
  if (process.env[REAL_RUN_FLAG] !== '1') {
    throw new Error(
      `Refusing real Clerk invitation evidence. Set ${REAL_RUN_FLAG}=1 only for the explicit sandbox command.`,
    );
  }

  const secretKey = requiredEnvironment('CLERK_SECRET_KEY');
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Refusing a non-test Clerk secret key');
  }
  const publishableKey = requiredEnvironment(
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  );
  if (!publishableKey.startsWith('pk_test_')) {
    throw new Error('Refusing a non-test Clerk publishable key');
  }

  return Object.freeze({
    secretKey,
    publishableKey,
    accountPortalUrl: canonicalClerkDevelopmentOrigin(
      'DIVE_CLERK_SANDBOX_ACCOUNT_PORTAL_URL',
    ),
    existingUserId: requiredEnvironment('DIVE_CLERK_SANDBOX_USER_ID'),
    existingUserPassword: requiredEnvironment(
      'DIVE_CLERK_SANDBOX_USER_PASSWORD',
    ),
    controlUserId: requiredEnvironment('DIVE_CLERK_SANDBOX_CONTROL_USER_ID'),
    controlUserPassword: requiredEnvironment(
      'DIVE_CLERK_SANDBOX_CONTROL_USER_PASSWORD',
    ),
    newUserEmail: requiredEnvironment('DIVE_CLERK_SANDBOX_NEW_USER_EMAIL'),
    newUserPassword: requiredEnvironment(
      'DIVE_CLERK_SANDBOX_NEW_USER_PASSWORD',
    ),
  });
}

function exactEmailUsers(
  clerk: ReturnType<typeof createClerkClient>,
  emailAddress: string,
) {
  return clerk.users
    .getUserList({ emailAddress: [emailAddress] })
    .then((page) =>
      page.data.filter((user) =>
        user.emailAddresses.some(
          (email) =>
            email.emailAddress.toLocaleLowerCase() ===
            emailAddress.toLocaleLowerCase(),
        ),
      ),
    );
}

async function primaryEmailForUser(
  clerk: ReturnType<typeof createClerkClient>,
  userId: string,
): Promise<string> {
  const user = await clerk.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  )?.emailAddress;
  if (!primaryEmail)
    throw new Error('Technical Clerk user has no primary email');
  return primaryEmail;
}

function observeBrowserSecurity(page: Page): BrowserSecurityObservation {
  const observation: BrowserSecurityObservation = {
    ticketOutsideAcceptance: false,
    ticketInReferrer: false,
    ticketInBrowserOutput: false,
  };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.searchParams.has('__clerk_ticket') &&
      url.pathname !== '/bootstrap/accept'
    ) {
      observation.ticketOutsideAcceptance = true;
    }
    if (request.headers().referer?.includes('__clerk_ticket')) {
      observation.ticketInReferrer = true;
    }
  });
  page.on('console', (message) => {
    if (message.text().includes('__clerk_ticket')) {
      observation.ticketInBrowserOutput = true;
    }
  });
  page.on('pageerror', (error) => {
    if (error.message.includes('__clerk_ticket')) {
      observation.ticketInBrowserOutput = true;
    }
  });
  return observation;
}

async function waitForProbe(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () =>
        Boolean(
          (
            globalThis as unknown as {
              __DIVE_CLERK_INVITATION_PROBE__?: unknown;
            }
          ).__DIVE_CLERK_INVITATION_PROBE__,
        ),
      undefined,
      { timeout: 60_000 },
    );
    await page.evaluate(async () => {
      const probe = (
        globalThis as unknown as {
          __DIVE_CLERK_INVITATION_PROBE__: { ready: Promise<unknown> };
        }
      ).__DIVE_CLERK_INVITATION_PROBE__;
      await probe.ready;
    });
    return true;
  } catch {
    return false;
  }
}

async function openInvitation(
  page: Page,
  invitationUrl: string,
): Promise<boolean> {
  try {
    await page.goto(invitationUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
  } catch {
    throw new Error('Clerk invitation navigation failed');
  }
  return waitForProbe(page);
}

async function invokeProbe(
  page: Page,
  operation:
    | 'establishSession'
    | 'attemptUninvitedSignUp'
    | 'attemptSignUp'
    | 'attemptSignIn'
    | 'finalizeSignUp'
    | 'finalizeSignIn',
  args: string[] = [],
): Promise<ProbeState> {
  const expectedOrigin = new URL(page.url()).origin;
  try {
    return await page.evaluate(
      async ({ method, values }) => {
        const probe = (
          globalThis as unknown as {
            __DIVE_CLERK_INVITATION_PROBE__: Record<
              string,
              (...operationArgs: string[]) => Promise<ProbeState>
            >;
          }
        ).__DIVE_CLERK_INVITATION_PROBE__;
        const selectedOperation = probe[method];
        if (!selectedOperation)
          throw new Error('Invitation probe operation missing');
        return selectedOperation(...values);
      },
      { method: operation, values: args },
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes('Execution context was destroyed') ||
      page.isClosed()
    ) {
      throw error;
    }
    await page.waitForLoadState('domcontentloaded');
    if (
      new URL(page.url()).origin !== expectedOrigin ||
      !(await waitForProbe(page))
    ) {
      return Object.freeze({
        phase: 'provider_rejected',
        clerkStatus: null,
        providerCode: 'navigation_outside_probe',
        signedIn: false,
      });
    }
    return page.evaluate(() => {
      const probe = (
        globalThis as unknown as {
          __DIVE_CLERK_INVITATION_PROBE__: { snapshot: () => ProbeState };
        }
      ).__DIVE_CLERK_INVITATION_PROBE__;
      return probe.snapshot();
    });
  }
}

async function classifyActiveSession(
  page: Page,
  expectedUserId: string,
): Promise<
  Readonly<{
    matching: boolean;
    activeSessionPresent: boolean;
    accountSwitchAvailable: boolean;
  }>
> {
  return page.evaluate((userId) => {
    const probe = (
      globalThis as unknown as {
        __DIVE_CLERK_INVITATION_PROBE__: {
          classifyActiveSession: (expected: string) => Readonly<{
            matching: boolean;
            activeSessionPresent: boolean;
            accountSwitchAvailable: boolean;
          }>;
        };
      }
    ).__DIVE_CLERK_INVITATION_PROBE__;
    return probe.classifyActiveSession(userId);
  }, expectedUserId);
}

async function currentSessionId(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const clerk = (
      globalThis as unknown as { Clerk?: { session?: { id?: string } } }
    ).Clerk;
    return clerk?.session?.id;
  });
}

function expectNoTicketLeak(
  page: Page,
  observation: BrowserSecurityObservation,
): void {
  expect(page.url().includes('__clerk_ticket')).toBe(false);
  expect(observation.ticketOutsideAcceptance).toBe(false);
  expect(observation.ticketInReferrer).toBe(false);
  expect(observation.ticketInBrowserOutput).toBe(false);
}

describe('Clerk invitation acceptance probe', () => {
  it('serves the exact loopback route with no-referrer protection', async () => {
    const probe = await startClerkInvitationProbe(LOCAL_TEST_PUBLISHABLE_KEY);
    try {
      const response = await fetch(
        `${probe.redirectUrl}?__clerk_ticket=not-retained`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(await response.text()).not.toContain('not-retained');
      expect(probe.requests).toEqual([
        {
          pathname: '/bootstrap/accept',
          hadTicket: true,
          referrerHadTicket: false,
          blockedProductBoundary: false,
        },
      ]);
    } finally {
      await probe.close();
    }
  });

  it('serves the React fixture and blocks product bootstrap calls', async () => {
    const probe = await startClerkInvitationProbe(LOCAL_TEST_PUBLISHABLE_KEY);
    try {
      const acceptanceResponse = await fetch(probe.redirectUrl);
      const acceptanceHtml = await acceptanceResponse.text();
      expect(acceptanceHtml).toContain('/src/main.tsx');
      expect(acceptanceHtml).toContain('type="module"');

      const productResponse = await fetch(
        `${probe.origin}/v1/me/tenant-bootstrap`,
        { method: 'POST' },
      );
      expect(productResponse.status).toBe(409);
      expect(probe.requests.at(-1)).toEqual({
        pathname: '/v1/me/tenant-bootstrap',
        hadTicket: false,
        referrerHadTicket: false,
        blockedProductBoundary: true,
      });
    } finally {
      await probe.close();
    }
  });
});

describe('Clerk invitation sandbox evidence', () => {
  let config: InvitationSandboxConfig;
  let clerk: ReturnType<typeof createClerkClient>;
  let browser: Browser;
  let probe: Awaited<ReturnType<typeof startClerkInvitationProbe>>;
  let existingUserEmail: string;
  let controlUserEmail: string;
  let testingToken: string;
  let frontendApi: string;
  const invitationIds = new Set<string>();
  const sessionIds = new Set<string>();
  const observations: SafeObservation[] = [];

  async function createInvitation(
    emailAddress: string,
    ignoreExisting: boolean,
  ): Promise<Readonly<{ id: string; url: string }>> {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress,
      expiresInDays: 7,
      ignoreExisting,
      notify: false,
      redirectUrl: probe.redirectUrl,
    });
    invitationIds.add(invitation.id);
    if (!invitation.url) {
      if (invitation.status === 'pending') {
        await clerk.invitations.revokeInvitation(invitation.id);
      }
      throw new Error('invitation_url_unavailable');
    }
    return Object.freeze({ id: invitation.id, url: invitation.url });
  }

  async function createBrowserContext(): Promise<BrowserContext> {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    process.env.CLERK_TESTING_TOKEN = testingToken;
    await setupClerkTestingToken({
      context,
      options: { frontendApiUrl: frontendApi },
    });
    await context.route(
      `https://${frontendApi}/v1/tickets/accept?*`,
      async (route) => {
        const url = new URL(route.request().url());
        url.searchParams.set('__clerk_testing_token', testingToken);
        await route.continue({ url: url.toString() });
      },
    );
    return context;
  }

  async function cleanProviderResources(): Promise<void> {
    let cleanupFailed = false;
    for (const sessionId of sessionIds) {
      try {
        const session = await clerk.sessions.getSession(sessionId);
        if (session.status === 'active') {
          await clerk.sessions.revokeSession(sessionId);
        }
      } catch {
        cleanupFailed = true;
      }
    }
    sessionIds.clear();

    for (const invitationId of invitationIds) {
      try {
        const page = await clerk.invitations.getInvitationList({
          query: invitationId,
        });
        const invitation = page.data.find((item) => item.id === invitationId);
        if (invitation?.status === 'pending') {
          await clerk.invitations.revokeInvitation(invitationId);
        }
      } catch {
        cleanupFailed = true;
      }
    }
    invitationIds.clear();

    try {
      const disposableUsers = await exactEmailUsers(clerk, config.newUserEmail);
      for (const user of disposableUsers) {
        await clerk.users.deleteUser(user.id);
      }
    } catch {
      cleanupFailed = true;
    }

    if (cleanupFailed) {
      throw new Error('Clerk invitation sandbox cleanup failed');
    }
  }

  beforeAll(async () => {
    config = loadInvitationSandboxConfig();
    clerk = createClerkClient({ secretKey: config.secretKey });
    const instance = await clerk.instance.get();
    if (instance.environmentType !== 'development') {
      throw new Error('Refusing a non-development Clerk instance');
    }
    if (config.existingUserId === config.controlUserId) {
      throw new Error('Clerk sandbox users must be distinct');
    }
    frontendApi = parsePublishableKey(config.publishableKey, {
      fatal: true,
    }).frontendApi;
    testingToken = (await clerk.testingTokens.createTestingToken()).token;
    existingUserEmail = await primaryEmailForUser(clerk, config.existingUserId);
    controlUserEmail = await primaryEmailForUser(clerk, config.controlUserId);
    if ((await exactEmailUsers(clerk, config.newUserEmail)).length !== 0) {
      throw new Error('Disposable Clerk sandbox identity already exists');
    }
    probe = await startClerkInvitationProbe(config.publishableKey);
    browser = await chromium.launch();
  });

  afterEach(cleanProviderResources);

  afterAll(async () => {
    if (probe?.requests.some((request) => request.blockedProductBoundary)) {
      throw new Error(
        'Invitation sandbox invoked a product bootstrap boundary',
      );
    }
    if (observations.length > 0) {
      console.info(
        JSON.stringify({
          harness: 'clerk-invitation-sandbox',
          observations,
          knownGaps: [
            'natural seven-day expiry',
            'real provider 429 response',
            'canonical deployed authentication host',
            'product bootstrap acceptance route',
          ],
        }),
      );
    }
    await browser?.close();
    await probe?.close();
  });

  it('loads only an explicitly authorized Clerk Development configuration', async () => {
    expect(config.secretKey).toMatch(/^sk_test_/);
    expect(config.publishableKey).toMatch(/^pk_test_/);
    expect(new URL(config.accountPortalUrl).hostname).toMatch(
      /\.accounts\.dev$/,
    );
    expect(await exactEmailUsers(clerk, existingUserEmail)).toHaveLength(1);
    expect(await exactEmailUsers(clerk, controlUserEmail)).toHaveLength(1);
  });

  it('records ignoreExisting behavior for an existing application identity', async () => {
    let rejected = false;
    try {
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: existingUserEmail,
        expiresInDays: 7,
        ignoreExisting: false,
        notify: false,
        redirectUrl: probe.redirectUrl,
      });
      invitationIds.add(invitation.id);
    } catch {
      rejected = true;
    }
    observations.push({
      scenario: 'IGNORE-EXISTING-FALSE',
      result: rejected ? 'provider_rejected' : 'invitation_created',
    });
    expect(rejected).toBe(true);

    const invitation = await createInvitation(existingUserEmail, true);
    observations.push({
      scenario: 'IGNORE-EXISTING-TRUE',
      result: 'invitation_created_with_url',
    });
    expect(invitation.id).toMatch(/^inv_/);
  });

  it('proves invite-only signup rejection and existing-user sign-in', async () => {
    const uninvitedContext = await createBrowserContext();
    const signInContext = await createBrowserContext();
    try {
      const uninvitedPage = await uninvitedContext.newPage();
      const security = observeBrowserSecurity(uninvitedPage);
      await uninvitedPage.goto(probe.redirectUrl, {
        waitUntil: 'domcontentloaded',
      });
      expect(await waitForProbe(uninvitedPage)).toBe(true);
      const uninvitedState = await invokeProbe(
        uninvitedPage,
        'attemptUninvitedSignUp',
        [config.newUserEmail, config.newUserPassword],
      );
      expect(uninvitedState.phase).toBe('provider_rejected');
      expect(await exactEmailUsers(clerk, config.newUserEmail)).toHaveLength(0);
      expectNoTicketLeak(uninvitedPage, security);

      const signInPage = await signInContext.newPage();
      await signInPage.goto(probe.redirectUrl, {
        waitUntil: 'domcontentloaded',
      });
      expect(await waitForProbe(signInPage)).toBe(true);
      const signInState = await invokeProbe(signInPage, 'establishSession', [
        existingUserEmail,
        config.existingUserPassword,
      ]);
      expect(signInState).toMatchObject({
        phase: 'session_established',
        clerkStatus: 'complete',
        signedIn: true,
      });
      const sessionId = await currentSessionId(signInPage);
      expect(sessionId).toBeDefined();
      sessionIds.add(sessionId as string);
      observations.push({
        scenario: 'INVITE-ONLY',
        result: 'uninvited_signup_blocked_existing_sign_in_available',
        signedIn: true,
      });
    } finally {
      await uninvitedContext.close();
      await signInContext.close();
    }
  });

  it('observes a new identity without an active session', async () => {
    const invitation = await createInvitation(config.newUserEmail, false);
    const context = await createBrowserContext();
    try {
      const page = await context.newPage();
      const security = observeBrowserSecurity(page);
      expect(await openInvitation(page, invitation.url)).toBe(true);
      let state = await invokeProbe(page, 'attemptSignUp', [
        config.newUserPassword,
      ]);
      if (state.clerkStatus === 'complete') {
        state = await invokeProbe(page, 'finalizeSignUp');
      }
      const createdUsers = await exactEmailUsers(clerk, config.newUserEmail);
      for (const user of createdUsers) {
        const sessions = await clerk.sessions.getSessionList({
          userId: user.id,
        });
        for (const session of sessions.data) sessionIds.add(session.id);
      }
      expect(state).toMatchObject({
        phase: 'sign_up_finalized',
        clerkStatus: 'complete',
        providerCode: null,
        signedIn: true,
      });
      expect(createdUsers).toHaveLength(1);
      expectNoTicketLeak(page, security);
      observations.push({
        scenario: 'NEW-IDENTITY',
        result: 'identity_created',
        clerkStatus: state.clerkStatus,
        providerCode: state.providerCode,
        signedIn: state.signedIn,
        ticketRemoved: true,
      });
    } finally {
      await context.close();
    }
  });

  it('observes an existing identity without an active session', async () => {
    const invitation = await createInvitation(existingUserEmail, true);
    const context = await createBrowserContext();
    try {
      const page = await context.newPage();
      const security = observeBrowserSecurity(page);
      expect(await openInvitation(page, invitation.url)).toBe(true);
      let state = await invokeProbe(page, 'attemptSignIn', [
        config.existingUserPassword,
      ]);
      if (state.clerkStatus === 'complete') {
        state = await invokeProbe(page, 'finalizeSignIn');
      }
      const sessionId = await currentSessionId(page);
      if (sessionId) sessionIds.add(sessionId);
      expect(state).toMatchObject({
        phase: 'sign_in_finalized',
        clerkStatus: 'complete',
        providerCode: null,
        signedIn: true,
      });
      expect(sessionId).toBeDefined();
      expectNoTicketLeak(page, security);
      observations.push({
        scenario: 'EXISTING-NO-SESSION',
        result: 'existing_identity_signed_in',
        clerkStatus: state.clerkStatus,
        signedIn: state.signedIn,
        ticketRemoved: true,
      });
    } finally {
      await context.close();
    }
  });

  it('observes a matching active session without product completion', async () => {
    const context = await createBrowserContext();
    try {
      const page = await context.newPage();
      await page.goto(probe.redirectUrl, { waitUntil: 'domcontentloaded' });
      expect(await waitForProbe(page)).toBe(true);
      const sessionState = await invokeProbe(page, 'establishSession', [
        existingUserEmail,
        config.existingUserPassword,
      ]);
      expect(sessionState).toMatchObject({
        phase: 'session_established',
        clerkStatus: 'complete',
        signedIn: true,
      });
      const activeSessionId = await currentSessionId(page);
      expect(activeSessionId).toBeDefined();
      sessionIds.add(activeSessionId as string);
      const invitation = await createInvitation(existingUserEmail, true);
      const security = observeBrowserSecurity(page);
      expect(await openInvitation(page, invitation.url)).toBe(true);
      const classification = await classifyActiveSession(
        page,
        config.existingUserId,
      );
      expect(classification.activeSessionPresent).toBe(true);
      expect(classification.matching).toBe(true);
      const state = await invokeProbe(page, 'attemptSignIn', [
        config.existingUserPassword,
      ]);
      expect(state).toMatchObject({ clerkStatus: null, signedIn: true });
      expectNoTicketLeak(page, security);
      observations.push({
        scenario: 'MATCHING-SESSION',
        result: 'matching_session_observed_without_bootstrap',
        clerkStatus: state.clerkStatus,
        signedIn: state.signedIn,
        ticketRemoved: true,
      });
    } finally {
      await context.close();
    }
  });

  it('denies a different active session neutrally and offers account switching', async () => {
    const context = await createBrowserContext();
    try {
      const page = await context.newPage();
      await page.goto(probe.redirectUrl, { waitUntil: 'domcontentloaded' });
      expect(await waitForProbe(page)).toBe(true);
      const sessionState = await invokeProbe(page, 'establishSession', [
        controlUserEmail,
        config.controlUserPassword,
      ]);
      expect(sessionState).toMatchObject({
        phase: 'session_established',
        clerkStatus: 'complete',
        signedIn: true,
      });
      const activeSessionId = await currentSessionId(page);
      expect(activeSessionId).toBeDefined();
      sessionIds.add(activeSessionId as string);
      const invitation = await createInvitation(existingUserEmail, true);
      const security = observeBrowserSecurity(page);
      expect(await openInvitation(page, invitation.url)).toBe(true);
      const classification = await classifyActiveSession(
        page,
        config.existingUserId,
      );
      expect(classification.activeSessionPresent).toBe(true);
      expect(classification.matching).toBe(false);
      expect(classification.accountSwitchAvailable).toBe(true);
      const state = await invokeProbe(page, 'attemptSignIn', [
        config.existingUserPassword,
      ]);
      expect(state).toMatchObject({ clerkStatus: null, signedIn: true });
      expectNoTicketLeak(page, security);
      observations.push({
        scenario: 'DIFFERENT-SESSION',
        result: 'neutral_denial_with_account_switch_available',
        clerkStatus: state.clerkStatus,
        signedIn: state.signedIn,
        ticketRemoved: true,
      });
    } finally {
      await context.close();
    }
  });

  it('observes revocation and a replacement invitation', async () => {
    const revoked = await createInvitation(config.newUserEmail, false);
    await clerk.invitations.revokeInvitation(revoked.id);

    const revokedContext = await createBrowserContext();
    const replacementContext = await createBrowserContext();
    try {
      const revokedPage = await revokedContext.newPage();
      const revokedReachedProbe = await openInvitation(
        revokedPage,
        revoked.url,
      );
      let revokedResult = 'revoked_link_did_not_reach_probe';
      if (revokedReachedProbe) {
        const state = await invokeProbe(revokedPage, 'attemptSignUp', [
          config.newUserPassword,
        ]);
        revokedResult =
          state.phase === 'provider_rejected'
            ? 'revoked_link_rejected'
            : 'revoked_link_unexpectedly_processed';
      }
      expect(revokedResult).not.toBe('revoked_link_unexpectedly_processed');
      expect(await exactEmailUsers(clerk, config.newUserEmail)).toHaveLength(0);

      const replacement = await createInvitation(config.newUserEmail, false);
      const replacementPage = await replacementContext.newPage();
      const security = observeBrowserSecurity(replacementPage);
      expect(await openInvitation(replacementPage, replacement.url)).toBe(true);
      expect(security.ticketOutsideAcceptance).toBe(false);
      expect(security.ticketInReferrer).toBe(false);
      observations.push({
        scenario: 'REVOKE-REISSUE',
        result: `${revokedResult}_replacement_link_reached_probe`,
      });
    } finally {
      await revokedContext.close();
      await replacementContext.close();
    }
  });
});
