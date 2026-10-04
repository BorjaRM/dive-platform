import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn(),
  processNextBootstrap: vi.fn(),
  processNextOrdinary: vi.fn(),
}));

vi.mock('@dive-center/database', () => ({
  assertRuntimeDatabaseRole: vi.fn(),
  workerDatabasePoolConfig: vi.fn(() => ({})),
}));

vi.mock('@dive-center/identity', () => ({
  ClerkBootstrapInvitationAdapter: class {},
  ClerkOrdinaryInvitationAdapter: class {},
}));

vi.mock('pg', () => ({
  Pool: class {
    query = mocks.query;
    end = mocks.end;
  },
}));

vi.mock('./bootstrap-invitation-worker.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('./bootstrap-invitation-worker.js')
  >()),
  processNextBootstrapInvitation: mocks.processNextBootstrap,
}));

vi.mock('./ordinary-invitation-worker.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ordinary-invitation-worker.js')>()),
  processNextOrdinaryInvitation: mocks.processNextOrdinary,
}));

describe('invitation worker command output', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv('BOOTSTRAP_INVITATION_WRITES_ENABLED', 'true');
    vi.stubEnv('BOOTSTRAP_INVITATION_DELIVERY_ENABLED', 'true');
    vi.stubEnv('ORDINARY_INVITATION_WRITES_ENABLED', 'true');
    vi.stubEnv('ORDINARY_INVITATION_DELIVERY_ENABLED', 'false');
    vi.stubEnv('CLERK_SECRET_KEY', 'test-secret');
    vi.stubEnv('AUTHENTICATION_ORIGIN', 'http://localhost:3000');
    vi.stubEnv(
      'BOOTSTRAP_INVITATION_REDIRECT_URL',
      'http://localhost:3000/bootstrap/accept',
    );
    vi.stubEnv('CLERK_REQUEST_TIMEOUT_MS', '15000');
    mocks.query.mockResolvedValue({ rows: [{ current_user: 'dive_worker' }] });
    mocks.end.mockResolvedValue(undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reports disabled delivery without processing the queue', async () => {
    vi.stubEnv('BOOTSTRAP_INVITATION_DELIVERY_ENABLED', 'false');
    await import('./main.js');
    expect(console.info).toHaveBeenCalledWith(
      'Bootstrap invitation delivery is disabled',
    );
    expect(mocks.processNextBootstrap).not.toHaveBeenCalled();
  });

  it('fails before processing the queue when the canonical authentication origin is missing', async () => {
    vi.stubEnv('AUTHENTICATION_ORIGIN', '');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await import('./main.js');
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(mocks.processNextBootstrap).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      'Bootstrap invitation worker failed',
    );
  });

  it('reports an idle queue without claiming an email was sent', async () => {
    mocks.processNextBootstrap.mockResolvedValue('idle');
    await import('./main.js');
    await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      'No eligible bootstrap invitation events remain',
    );
  });

  it('reports processed operations before the queue becomes idle', async () => {
    mocks.processNextBootstrap
      .mockResolvedValueOnce('succeeded')
      .mockResolvedValueOnce('retrying')
      .mockResolvedValueOnce('idle');
    await import('./main.js');
    await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());
    expect(console.info).toHaveBeenNthCalledWith(
      1,
      'Bootstrap invitation operation: succeeded',
    );
    expect(console.info).toHaveBeenNthCalledWith(
      2,
      'Bootstrap invitation operation: retrying',
    );
    expect(console.info).toHaveBeenNthCalledWith(
      3,
      'No eligible bootstrap invitation events remain',
    );
  });

  it('keeps ordinary worker logs free of tenant, correlation and invitation secrets', async () => {
    vi.stubEnv('BOOTSTRAP_INVITATION_DELIVERY_ENABLED', 'false');
    vi.stubEnv('ORDINARY_INVITATION_DELIVERY_ENABLED', 'true');
    vi.stubEnv('ORDINARY_INVITATION_REDIRECT_URL', 'http://localhost:3000/invite');
    mocks.processNextOrdinary
      .mockResolvedValueOnce('succeeded')
      .mockResolvedValueOnce('idle');

    await import('./main.js');
    await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());

    expect(console.info).toHaveBeenCalledWith(
      'Ordinary invitation operation: succeeded',
    );
    expect(console.info).toHaveBeenCalledWith(
      'No eligible ordinary invitation events remain',
    );
    expect(console.info).not.toHaveBeenCalledWith(
      expect.stringContaining('invitee@example.test'),
    );
    expect(console.info).not.toHaveBeenCalledWith(
      expect.stringContaining('tenant-1'),
    );
    expect(console.info).not.toHaveBeenCalledWith(
      expect.stringContaining('correlation-1'),
    );
    expect(console.info).not.toHaveBeenCalledWith(
      expect.stringContaining('bearer-secret'),
    );
  });
});
