import { isClerkAPIResponseError } from '@clerk/backend/errors';
import type { Browser, Locator, Page } from 'playwright';

export async function assertClerkSessionCannotMintToken(
  requestToken: () => Promise<unknown>,
): Promise<void> {
  try {
    await requestToken();
  } catch (error) {
    if (
      isClerkAPIResponseError(error) &&
      error.status === 404 &&
      error.errors.length > 0 &&
      error.errors.every((detail) => detail.code === 'resource_not_found')
    ) {
      return;
    }
    throw new Error(
      'Token issuance failed without a documented session denial',
    );
  }
  throw new Error('Clerk still issued a token for the revoked session');
}

type ClerkBrowserSessionOptions = Readonly<{
  browser: Browser;
  accountPortalUrl: string;
  email: string;
  password: string;
  onSessionCreated: (sessionId: string) => void;
  timeoutMs?: number;
}>;

export type ClerkBrowserSession = Readonly<{
  id: string;
  token: string;
}>;

type ClerkWindow = {
  Clerk?: {
    session?: {
      id: string;
      getToken: () => Promise<string | null>;
    };
  };
};

const DEFAULT_TIMEOUT_MS = 60_000;

function signInUrl(accountPortalUrl: string): string {
  return `${accountPortalUrl}/sign-in?redirect_url=${encodeURIComponent(`${accountPortalUrl}/default-redirect`)}`;
}

async function submit(
  page: Page,
  field: Locator,
  buttonName: 'Continue',
): Promise<void> {
  await page
    .locator('form')
    .filter({ has: field })
    .getByRole('button', { name: buttonName })
    .first()
    .click();
}

export async function signInClerkPage(
  page: Page,
  options: Omit<ClerkBrowserSessionOptions, 'browser'>,
): Promise<ClerkBrowserSession> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  page.setDefaultTimeout(timeoutMs);

  await page.goto(signInUrl(options.accountPortalUrl), {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  return completeClerkSignIn(page, options);
}

export async function completeClerkSignIn(
  page: Page,
  options: Pick<
    ClerkBrowserSessionOptions,
    'email' | 'password' | 'timeoutMs' | 'onSessionCreated'
  >,
): Promise<ClerkBrowserSession> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  page.setDefaultTimeout(timeoutMs);
  const identifier = page
    .locator('input[name="identifier"], input[type="email"]')
    .first();
  await identifier.waitFor({ state: 'visible' });
  await identifier.fill(options.email);
  await submit(page, identifier, 'Continue');

  const password = page.locator('input[name="password"]').first();
  await password.waitFor({ state: 'visible' });
  await password.fill(options.password);
  await submit(page, password, 'Continue');

  await page.waitForFunction(
    () => {
      const clerk = (globalThis as unknown as ClerkWindow).Clerk;
      const location = (
        globalThis as unknown as { location?: { pathname?: string } }
      ).location;
      return (
        typeof clerk?.session?.id === 'string' ||
        location?.pathname?.includes('/client-trust') === true
      );
    },
    undefined,
    { timeout: timeoutMs },
  );

  if (page.url().includes('/client-trust')) {
    throw new Error(
      'Clerk sandbox user requires client trust verification; enable bypass_client_trust only for technical sandbox users.',
    );
  }

  const sessionId = await page.evaluate(() => {
    const session = (globalThis as unknown as ClerkWindow).Clerk?.session;
    if (!session?.id) throw new Error('Clerk browser session is missing');
    return session.id;
  });
  options.onSessionCreated(sessionId);

  const token = await page.evaluate(async (expectedSessionId) => {
    const clerk = (globalThis as unknown as ClerkWindow).Clerk;
    if (clerk?.session?.id !== expectedSessionId)
      throw new Error('Clerk browser session changed before token retrieval');
    const token = await clerk.session.getToken();
    if (!token) throw new Error('Clerk browser session token is missing');
    return token;
  }, sessionId);

  return Object.freeze({ id: sessionId, token });
}

export async function createClerkBrowserSession(
  options: ClerkBrowserSessionOptions,
): Promise<ClerkBrowserSession> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const context = await options.browser.newContext();
  const page = await context.newPage();

  try {
    return await signInClerkPage(page, {
      accountPortalUrl: options.accountPortalUrl,
      email: options.email,
      password: options.password,
      onSessionCreated: options.onSessionCreated,
      timeoutMs,
    });
  } finally {
    await context.close();
  }
}
