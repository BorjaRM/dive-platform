import type { Browser, Locator, Page } from 'playwright';

type ClerkBrowserSessionOptions = Readonly<{
  browser: Browser;
  accountPortalUrl: string;
  email: string;
  password: string;
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
  buttonName: 'Continue' | 'Sign in',
): Promise<void> {
  await page
    .locator('form')
    .filter({ has: field })
    .getByRole('button', { name: buttonName })
    .first()
    .click();
}

export async function createClerkBrowserSession(
  options: ClerkBrowserSessionOptions,
): Promise<ClerkBrowserSession> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const context = await options.browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  try {
    await page.goto(signInUrl(options.accountPortalUrl), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const identifier = page
      .locator('input[name="identifier"], input[type="email"]')
      .first();
    await identifier.waitFor({ state: 'visible' });
    await identifier.fill(options.email);
    await submit(page, identifier, 'Continue');

    const password = page.locator('input[name="password"]').first();
    await password.waitFor({ state: 'visible' });
    await password.fill(options.password);
    await submit(page, password, 'Sign in');

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

    const session = await page.evaluate(async () => {
      const clerk = (globalThis as unknown as ClerkWindow).Clerk;
      if (!clerk?.session) throw new Error('Clerk browser session is missing');
      const token = await clerk.session.getToken();
      if (!token) throw new Error('Clerk browser session token is missing');
      return { id: clerk.session.id, token };
    });

    return Object.freeze(session);
  } finally {
    await context.close();
  }
}
