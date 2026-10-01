import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn(),
  processNext: vi.fn(),
}));

vi.mock('@dive-center/database', () => ({
  assertRuntimeDatabaseRole: vi.fn(),
  workerDatabasePoolConfig: vi.fn(() => ({})),
}));

vi.mock('@dive-center/identity', () => ({
  ClerkBootstrapInvitationAdapter: class {},
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
  processNextBootstrapInvitation: mocks.processNext,
}));

describe('invitation worker command output', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv('BOOTSTRAP_INVITATION_WRITES_ENABLED', 'true');
    vi.stubEnv('BOOTSTRAP_INVITATION_DELIVERY_ENABLED', 'true');
    vi.stubEnv('CLERK_SECRET_KEY', 'test-secret');
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
    expect(mocks.processNext).not.toHaveBeenCalled();
  });

  it('reports an idle queue without claiming an email was sent', async () => {
    mocks.processNext.mockResolvedValue('idle');
    await import('./main.js');
    await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      'No eligible bootstrap invitation events remain',
    );
  });

  it('reports processed operations before the queue becomes idle', async () => {
    mocks.processNext
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
});
