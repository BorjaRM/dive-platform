import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformInvitations } from './platform-invitations';

const clerk = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  sessionId: 'session-1',
  getToken: vi.fn<() => Promise<string | null>>(),
}));
const useAuthMock = vi.hoisted(() => vi.fn());
vi.mock('@clerk/nextjs', () => ({
  useAuth: useAuthMock,
  RedirectToSignIn: ({
    signInForceRedirectUrl,
  }: {
    signInForceRedirectUrl: string;
  }) => <p>Sign in: {signInForceRedirectUrl}</p>,
}));

const invitationId = 'aaaaaaaa-0001-4001-8001-000000000001';
const safeState = {
  invitationId,
  destinationEmail: 'owner@example.test',
  status: 'issued',
  deliveryStatus: 'pending',
};
const props = {
  clerkConfigured: true,
  returnUrl: 'https://auth.example.test/platform/invitations',
  requestTimeoutMillis: 5000,
};

function fill() {
  fireEvent.change(screen.getByLabelText('Destination email'), {
    target: { value: ' OWNER@Example.Test ' },
  });
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: ' Pilot onboarding ' },
  });
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Issue invitation' }));
}

beforeEach(() => {
  Object.assign(clerk, {
    isLoaded: true,
    isSignedIn: true,
    sessionId: 'session-1',
  });
  clerk.getToken.mockResolvedValue('operator-token');
  useAuthMock.mockReturnValue(clerk);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clerk.getToken.mockReset();
  useAuthMock.mockReset();
});

describe('DIVE-ONB-REQ-005,039,040 platform invitation console', () => {
  it('fails closed before accessing Clerk when configuration is absent', () => {
    render(<PlatformInvitations {...props} clerkConfigured={false} />);
    expect(
      screen.getByRole('heading', {
        name: 'Invitation administration is unavailable',
      }),
    ).toBeInTheDocument();
    expect(useAuthMock).not.toHaveBeenCalled();
  });

  it('waits for Clerk and redirects signed-out identities to the console login', () => {
    clerk.isLoaded = false;
    const view = render(<PlatformInvitations {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your session',
    );
    Object.assign(clerk, { isLoaded: true, isSignedIn: false });
    view.rerender(<PlatformInvitations {...props} />);
    expect(screen.getByText(`Sign in: ${props.returnUrl}`)).toBeInTheDocument();
  });

  it('issues only approved fields with explicit bearer and shows safe operational state', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json(
          { ...safeState, ticket: 'private-ticket' },
          { status: 201 },
        ),
      );
    render(<PlatformInvitations {...props} />);
    fill();
    submit();
    await screen.findByText('Pending processing');
    expect(screen.getByText('owner@example.test')).toBeInTheDocument();
    const [url, init] = upstream.mock.calls[0] ?? [];
    expect(url).toBe('/api/platform/invitations');
    expect(JSON.parse(String(init?.body))).toEqual({
      destinationEmail: 'owner@example.test',
      reason: 'Pilot onboarding',
    });
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer operator-token');
    expect(headers.get('idempotency-key')).toBeTruthy();
    expect(headers.has('x-tenant-context')).toBe(false);
    expect(init).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
    expect(screen.queryByText('private-ticket')).not.toBeInTheDocument();
    expect(upstream).toHaveBeenCalledOnce();
  });

  it('issues without a reason and omits the optional field', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(safeState, { status: 201 }));
    render(<PlatformInvitations {...props} />);
    fireEvent.change(screen.getByLabelText('Destination email'), {
      target: { value: ' OWNER@Example.Test ' },
    });
    expect(screen.getByLabelText('Reason')).not.toBeRequired();
    submit();
    await screen.findByText('Pending processing');
    expect(JSON.parse(String(upstream.mock.calls[0]?.[1]?.body))).toEqual({
      destinationEmail: 'owner@example.test',
    });
  });

  it('blocks duplicate submissions while token acquisition is pending', async () => {
    let releaseToken: (token: string) => void = () => undefined;
    clerk.getToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseToken = resolve;
        }),
    );
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(safeState));
    render(<PlatformInvitations {...props} />);
    fill();
    submit();
    submit();
    expect(clerk.getToken).toHaveBeenCalledOnce();
    await act(async () => releaseToken('operator-token'));
    await screen.findByText('Pending processing');
    expect(upstream).toHaveBeenCalledOnce();
  });

  it('retains payload and key after an uncertain outcome and does not retry automatically', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('private network detail'))
      .mockResolvedValueOnce(Response.json(safeState));
    render(<PlatformInvitations {...props} />);
    fill();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'outcome is unknown',
    );
    expect(upstream).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Destination email')).toHaveAttribute(
      'readonly',
    );
    expect(
      screen.queryByRole('button', { name: 'New invitation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry invitation' }));
    await screen.findByText('Pending processing');
    expect(upstream).toHaveBeenCalledTimes(2);
    const first = upstream.mock.calls[0]?.[1];
    const second = upstream.mock.calls[1]?.[1];
    expect(second?.body).toBe(first?.body);
    expect(new Headers(second?.headers).get('idempotency-key')).toBe(
      new Headers(first?.headers).get('idempotency-key'),
    );
  });

  it('keeps a retried operation unresolved after a previous definite rejection', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({}, { status: 429 }))
      .mockRejectedValueOnce(new TypeError('network unavailable'));
    render(<PlatformInvitations {...props} />);
    fill();
    submit();
    await screen.findByRole('button', { name: 'New invitation' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry invitation' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('outcome is unknown'),
    );
    expect(
      screen.queryByRole('button', { name: 'New invitation' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [403, 'permission'],
    [404, 'unavailable'],
    [409, 'conflicts'],
    [422, 'could not be accepted'],
    [429, '30 seconds'],
    [503, 'unavailable'],
  ])(
    'shows safe error for HTTP %s without expiring the session',
    async (status, expected) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json(
          { detail: 'private-ticket' },
          { status, headers: { 'Retry-After': '30' } },
        ),
      );
      render(<PlatformInvitations {...props} />);
      fill();
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent(expected);
      expect(
        screen.queryByText(`Sign in: ${props.returnUrl}`),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('private-ticket')).not.toBeInTheDocument();
    },
  );

  it('redirects only on a genuine session failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({}, { status: 401 }),
    );
    render(<PlatformInvitations {...props} />);
    fill();
    submit();
    await screen.findByText(`Sign in: ${props.returnUrl}`);
  });

  it('reads manually by ID without polling or issuing a new invitation', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ ...safeState, deliveryStatus: 'succeeded' }),
      );
    render(<PlatformInvitations {...props} />);
    fireEvent.change(screen.getByLabelText('Invitation ID'), {
      target: { value: invitationId },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Read invitation' }));
    await screen.findByText('Processed');
    expect(upstream).toHaveBeenCalledOnce();
    expect(upstream.mock.calls[0]?.[0]).toBe(
      `/api/platform/invitations/${invitationId}`,
    );
    expect(upstream.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('reissues an issued invitation with a reason and idempotency key', async () => {
    const replacementId = 'bbbbbbbb-0001-4001-8001-000000000001';
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(safeState))
      .mockResolvedValueOnce(
        Response.json({
          invitationId: replacementId,
          destinationEmail: 'owner@example.test',
          status: 'issued',
          deliveryStatus: 'pending',
        }),
      );
    render(<PlatformInvitations {...props} />);
    fireEvent.change(screen.getByLabelText('Invitation ID'), {
      target: { value: invitationId },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Read invitation' }));
    await screen.findByText('Pending processing');
    fireEvent.change(screen.getByLabelText('Change reason'), {
      target: { value: 'Replace expired email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reissue invitation' }));
    await screen.findByText(replacementId);
    const [url, init] = upstream.mock.calls[1] ?? [];
    expect(url).toBe(`/api/platform/invitations/${invitationId}/reissue`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      reason: 'Replace expired email',
    });
    expect(new Headers(init?.headers).get('idempotency-key')).toBeTruthy();
  });

  it('retries a revoke with the same request after an uncertain outcome', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(safeState))
      .mockRejectedValueOnce(new TypeError('private network detail'))
      .mockResolvedValueOnce(
        Response.json({
          invitationId,
          destinationEmail: 'owner@example.test',
          status: 'revoked',
          deliveryStatus: 'pending',
        }),
      );
    render(<PlatformInvitations {...props} />);
    fireEvent.change(screen.getByLabelText('Invitation ID'), {
      target: { value: invitationId },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Read invitation' }));
    await screen.findByText('Pending processing');
    fireEvent.change(screen.getByLabelText('Change reason'), {
      target: { value: 'Cancel duplicate invitation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Reissue invitation' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry revoke' }));
    await screen.findByText('Revoked');
    expect(upstream).toHaveBeenCalledTimes(3);
    const first = upstream.mock.calls[1]?.[1];
    const retry = upstream.mock.calls[2]?.[1];
    expect(retry?.body).toBe(first?.body);
    expect(new Headers(retry?.headers).get('idempotency-key')).toBe(
      new Headers(first?.headers).get('idempotency-key'),
    );
  });

  it('recovers a revoked dead-letter without offering reissue', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          invitationId,
          destinationEmail: 'owner@example.test',
          status: 'revoked',
          deliveryStatus: 'dead_letter',
        }),
      )
      .mockRejectedValueOnce(new TypeError('private network detail'))
      .mockResolvedValueOnce(
        Response.json({
          invitationId,
          destinationEmail: 'owner@example.test',
          status: 'revoked',
          deliveryStatus: 'pending',
        }),
      );
    render(<PlatformInvitations {...props} />);
    fireEvent.change(screen.getByLabelText('Invitation ID'), {
      target: { value: invitationId },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Read invitation' }));
    await screen.findByText('Processing failed');
    expect(
      screen.queryByRole('button', { name: 'Reissue invitation' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Recovery reason'), {
      target: { value: 'Reviewed revoke delivery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry revocation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'outcome is unknown',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry revocation' }));
    await screen.findByText('Revoked');

    const first = upstream.mock.calls[1];
    const retry = upstream.mock.calls[2];
    expect(first?.[0]).toBe(
      `/api/platform/invitations/${invitationId}/revoke/retry`,
    );
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
    expect(new Headers(retry?.[1]?.headers).get('idempotency-key')).toBe(
      new Headers(first?.[1]?.headers).get('idempotency-key'),
    );
  });

  it('rejects a malformed ID without making a request', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    render(<PlatformInvitations {...props} />);
    fireEvent.change(screen.getByLabelText('Invitation ID'), {
      target: { value: 'invalid' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Read invitation' }));
    expect(screen.getByRole('alert')).toHaveTextContent('valid invitation ID');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('drops old-session token results and resets drafts on session change', async () => {
    let releaseToken: (token: string) => void = () => undefined;
    clerk.getToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseToken = resolve;
        }),
    );
    const upstream = vi.spyOn(globalThis, 'fetch');
    const view = render(<PlatformInvitations {...props} />);
    fill();
    submit();
    clerk.sessionId = 'session-2';
    view.rerender(<PlatformInvitations {...props} />);
    await act(async () => releaseToken('old-token'));
    expect(upstream).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Destination email')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a late response body after unmount', async () => {
    let releaseBody: (value: unknown) => void = () => undefined;
    const response = Response.json(safeState);
    vi.spyOn(response, 'json').mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseBody = resolve;
        }),
    );
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const view = render(<PlatformInvitations {...props} />);
    fill();
    submit();
    await waitFor(() => expect(upstream).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => releaseBody(safeState));
    expect(screen.queryByText('Pending processing')).not.toBeInTheDocument();
  });
});
