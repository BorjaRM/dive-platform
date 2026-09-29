import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const TICKET_PARAMETER = '__clerk_ticket';
const PRODUCT_BOOTSTRAP_PATHS = new Set([
  '/v1/me/tenant-bootstrap',
  '/v1/platform/bootstrap-invitations',
]);
const FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/clerk-invitation-react',
);

export type ProbeRequest = Readonly<{
  pathname: string;
  hadTicket: boolean;
  referrerHadTicket: boolean;
  blockedProductBoundary: boolean;
}>;

export type ClerkInvitationProbe = Readonly<{
  origin: string;
  redirectUrl: string;
  requests: readonly ProbeRequest[];
  close: () => Promise<void>;
}>;

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    });
  });
}

function isBlockedProductPath(pathname: string): boolean {
  return (
    PRODUCT_BOOTSTRAP_PATHS.has(pathname) ||
    pathname.startsWith('/v1/platform/bootstrap-invitations/')
  );
}

export async function startClerkInvitationProbe(
  publishableKey: string,
): Promise<ClerkInvitationProbe> {
  if (!/^pk_test_[A-Za-z0-9_=-]+$/.test(publishableKey)) {
    throw new Error('Invitation probe requires a Clerk test publishable key');
  }

  const vite = await createViteServer({
    root: FIXTURE_ROOT,
    appType: 'spa',
    logLevel: 'silent',
    server: { middlewareMode: true },
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':
        JSON.stringify(publishableKey),
    },
  });
  const requests: ProbeRequest[] = [];
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const blockedProductBoundary = isBlockedProductPath(requestUrl.pathname);
    if (requestUrl.pathname === '/bootstrap/accept' || blockedProductBoundary) {
      requests.push(
        Object.freeze({
          pathname: requestUrl.pathname,
          hadTicket: requestUrl.searchParams.has(TICKET_PARAMETER),
          referrerHadTicket: (request.headers.referer ?? '').includes(
            TICKET_PARAMETER,
          ),
          blockedProductBoundary,
        }),
      );
    }

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (blockedProductBoundary) {
      response.writeHead(409, { 'Content-Type': 'application/json' });
      response.end('{"error":"product_boundary_blocked"}');
      return;
    }

    vite.middlewares(request, response, () => {
      response.writeHead(404);
      response.end();
    });
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    await vite.close();
    throw new Error('Invitation probe did not bind a loopback TCP port');
  }
  const origin = `http://127.0.0.1:${address.port}`;

  return Object.freeze({
    origin,
    redirectUrl: `${origin}/bootstrap/accept`,
    requests,
    close: async () => {
      await closeServer(server);
      await vite.close();
    },
  });
}
