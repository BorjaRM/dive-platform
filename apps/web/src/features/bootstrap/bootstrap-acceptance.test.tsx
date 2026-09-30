import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootstrapAcceptance } from './bootstrap-acceptance';

type Navigate = (input: { decorateUrl: (url: string) => string }) => void;
type SignOutCallback = () => unknown;

const routerMock = vi.hoisted(() => ({ replace: vi.fn() }));
const clerkMock = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false,
  signOut: vi.fn<(callback?: SignOutCallback) => Promise<void>>(),
  signIn: {
    status: 'idle',
    ticket: vi.fn(),
    password: vi.fn(),
    finalize: vi.fn(),
  },
  signUp: {
    status: 'idle',
    ticket: vi.fn(),
    password: vi.fn(),
    finalize: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: clerkMock.signOut }),
  useSignIn: () => ({ signIn: clerkMock.signIn }),
  useSignUp: () => ({ signUp: clerkMock.signUp }),
  useUser: () => ({
    isLoaded: clerkMock.isLoaded,
    isSignedIn: clerkMock.isSignedIn,
  }),
}));

describe('BootstrapAcceptance', () => {
  beforeEach(() => {
    clerkMock.isLoaded = true;
    clerkMock.isSignedIn = false;
    clerkMock.signIn.status = 'idle';
    clerkMock.signUp.status = 'idle';
    clerkMock.signOut.mockImplementation(async (callback) => {
      clerkMock.isSignedIn = false;
      await callback?.();
    });
    clerkMock.signIn.ticket.mockReset();
    clerkMock.signIn.password.mockReset();
    clerkMock.signIn.finalize.mockReset();
    clerkMock.signUp.ticket.mockReset();
    clerkMock.signUp.password.mockReset();
    clerkMock.signUp.finalize.mockReset();
    routerMock.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('shows a neutral failure when no invitation ticket is present', async () => {
    window.history.replaceState({}, '', '/bootstrap/accept');

    render(<BootstrapAcceptance />);

    expect(
      await screen.findByRole('heading', {
        name: 'This invitation cannot be opened',
      }),
    ).toBeInTheDocument();
    expect(clerkMock.signIn.ticket).not.toHaveBeenCalled();
    expect(clerkMock.signUp.ticket).not.toHaveBeenCalled();
  });

  it('signs out an active session and retains the ticket for reauthentication (DIVE-ONB-REQ-038)', async () => {
    clerkMock.isSignedIn = true;
    window.history.replaceState(
      {},
      '',
      '/bootstrap/accept?__clerk_status=sign_in&__clerk_ticket=secret-ticket',
    );
    clerkMock.signIn.ticket.mockImplementation(async () => {
      clerkMock.signIn.status = 'needs_first_factor';
      return { error: null };
    });
    clerkMock.signIn.password.mockImplementation(async () => {
      clerkMock.signIn.status = 'complete';
      return { error: null };
    });
    clerkMock.signIn.finalize.mockResolvedValue({ error: null });

    render(<BootstrapAcceptance />);

    const reauthenticateButton = await screen.findByRole('button', {
      name: 'Sign out and continue',
    });
    expect(window.location.search).toBe('');
    expect(routerMock.replace).not.toHaveBeenCalled();

    fireEvent.click(reauthenticateButton);

    await waitFor(() => expect(clerkMock.signOut).toHaveBeenCalledOnce());
    expect(clerkMock.signOut).toHaveBeenCalledWith(expect.any(Function));
    expect(clerkMock.isSignedIn).toBe(false);
    expect(window.location.pathname).toBe('/bootstrap/accept');
    expect(window.location.search).toBe('');
    expect(
      screen.queryByRole('button', { name: 'Existing account' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New account' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'existing-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(clerkMock.signIn.ticket).toHaveBeenCalledWith({
        ticket: 'secret-ticket',
      });
    });
    expect(routerMock.replace).not.toHaveBeenCalledWith('/bootstrap/setup');
  });

  it('fails neutrally when an active session cannot be signed out (DIVE-ONB-REQ-038)', async () => {
    clerkMock.isSignedIn = true;
    clerkMock.signOut.mockRejectedValueOnce(
      new Error('private-provider-error'),
    );
    window.history.replaceState(
      {},
      '',
      '/bootstrap/accept?__clerk_status=sign_in&__clerk_ticket=secret-ticket',
    );

    render(<BootstrapAcceptance />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign out and continue' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invitation could not be continued.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'private-provider-error',
    );
    expect(clerkMock.signIn.ticket).not.toHaveBeenCalled();
    expect(clerkMock.signUp.ticket).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('accepts a new account, removes the ticket, and finalizes into setup', async () => {
    window.history.replaceState(
      {},
      '',
      '/bootstrap/accept?__clerk_status=sign_up&__clerk_ticket=new-secret-ticket',
    );
    clerkMock.signUp.ticket.mockImplementation(async () => {
      clerkMock.signUp.status = 'needs_first_factor';
      return { error: null };
    });
    clerkMock.signUp.password.mockImplementation(async () => {
      clerkMock.signUp.status = 'complete';
      return { error: null };
    });
    clerkMock.signUp.finalize.mockImplementation(
      async ({ navigate }: { navigate: Navigate }) => {
        navigate({ decorateUrl: (url) => url });
        return { error: null };
      },
    );

    render(<BootstrapAcceptance />);

    await screen.findByRole('button', { name: 'Continue' });
    expect(document.getElementById('clerk-captcha')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New account' }),
    ).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
    const fields = await screen.findAllByLabelText(/password/i);
    const [password, passwordConfirmation] = fields;
    if (!password || !passwordConfirmation) {
      throw new Error('Expected password and confirmation fields');
    }
    fireEvent.change(password, { target: { value: 'correct-horse' } });
    fireEvent.change(passwordConfirmation, {
      target: { value: 'correct-horse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(clerkMock.signUp.finalize).toHaveBeenCalledOnce();
    });
    expect(clerkMock.signUp.ticket).toHaveBeenCalledWith({
      ticket: 'new-secret-ticket',
    });
    expect(clerkMock.signUp.password).toHaveBeenCalledWith({
      password: 'correct-horse',
    });
    expect(window.location.search).toBe('');
    expect(routerMock.replace).toHaveBeenCalledWith('/bootstrap/setup');
  });

  it('accepts an existing account through the sign-in ticket flow', async () => {
    window.history.replaceState(
      {},
      '',
      '/bootstrap/accept?__clerk_status=sign_in&__clerk_ticket=existing-secret-ticket',
    );
    clerkMock.signIn.ticket.mockImplementation(async () => {
      clerkMock.signIn.status = 'needs_first_factor';
      return { error: null };
    });
    clerkMock.signIn.password.mockImplementation(async () => {
      clerkMock.signIn.status = 'complete';
      return { error: null };
    });
    clerkMock.signIn.finalize.mockImplementation(
      async ({ navigate }: { navigate: Navigate }) => {
        navigate({ decorateUrl: (url) => url });
        return { error: null };
      },
    );

    render(<BootstrapAcceptance />);

    expect(
      screen.queryByRole('button', { name: 'Existing account' }),
    ).not.toBeInTheDocument();
    expect(document.getElementById('clerk-captcha')).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Password'), {
      target: { value: 'existing-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(clerkMock.signIn.finalize).toHaveBeenCalledOnce();
    });
    expect(clerkMock.signIn.ticket).toHaveBeenCalledWith({
      ticket: 'existing-secret-ticket',
    });
    expect(clerkMock.signIn.password).toHaveBeenCalledWith({
      password: 'existing-password',
    });
    expect(window.location.search).toBe('');
    expect(routerMock.replace).toHaveBeenCalledWith('/bootstrap/setup');
    expect(clerkMock.signUp.ticket).not.toHaveBeenCalled();
  });

  it.each(['pending', 'failed'] as const)(
    'preserves a %s acceptance operation when Clerk changes session state',
    async (state) => {
      window.history.replaceState(
        {},
        '',
        '/bootstrap/accept?__clerk_status=sign_in&__clerk_ticket=secret-ticket',
      );
      clerkMock.signIn.ticket.mockImplementation(async () => {
        clerkMock.signIn.status = 'complete';
        return { error: null };
      });
      let finishAcceptance = () => {};
      clerkMock.signIn.finalize.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishAcceptance = () => resolve({ error: null });
          }),
      );
      if (state === 'failed') {
        clerkMock.signIn.finalize.mockRejectedValueOnce(
          new Error('private-provider-error'),
        );
      }
      const rendered = render(<BootstrapAcceptance />);
      fireEvent.change(await screen.findByLabelText('Password'), {
        target: { value: 'existing-password' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() =>
        expect(clerkMock.signIn.finalize).toHaveBeenCalledOnce(),
      );
      if (state === 'failed') await screen.findByRole('alert');
      clerkMock.isSignedIn = true;
      rendered.rerender(<BootstrapAcceptance />);
      expect(
        screen.queryByRole('button', { name: 'Sign out and continue' }),
      ).not.toBeInTheDocument();
      if (state === 'pending') {
        expect(
          screen.getByRole('button', { name: 'Accepting invitation…' }),
        ).toBeDisabled();
        await act(async () => finishAcceptance());
      } else {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'This invitation could not be accepted.',
        );
      }
      expect(window.location.search).toBe('');
    },
  );

  it('does not start acceptance when Clerk does not classify the invitation (DIVE-ONB-REQ-038)', async () => {
    window.history.replaceState(
      {},
      '',
      '/bootstrap/accept?__clerk_ticket=unclassified-ticket',
    );

    render(<BootstrapAcceptance />);

    expect(
      await screen.findByRole('heading', {
        name: 'This invitation cannot be opened',
      }),
    ).toBeInTheDocument();
    expect(clerkMock.signIn.ticket).not.toHaveBeenCalled();
    expect(clerkMock.signUp.ticket).not.toHaveBeenCalled();
    expect(document.getElementById('clerk-captcha')).not.toBeInTheDocument();
  });

  it.each([
    ['sign_up', 'signUp'],
    ['sign_in', 'signIn'],
  ] as const)(
    'shows a neutral error when %s invitation acceptance fails (DIVE-ONB-REQ-038)',
    async (status, flow) => {
      window.history.replaceState(
        {},
        '',
        `/bootstrap/accept?__clerk_status=${status}&__clerk_ticket=rejected-ticket`,
      );
      const resource = flow === 'signUp' ? clerkMock.signUp : clerkMock.signIn;
      resource.ticket.mockResolvedValue({
        error: { code: 'private_provider_code' },
      });

      render(<BootstrapAcceptance />);

      fireEvent.change(await screen.findByLabelText('Password'), {
        target: { value: 'correct-horse' },
      });
      if (status === 'sign_up') {
        fireEvent.change(screen.getByLabelText('Confirm password'), {
          target: { value: 'correct-horse' },
        });
      }
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This invitation could not be accepted.',
      );
      expect(screen.getByRole('alert')).not.toHaveTextContent(
        'private_provider_code',
      );
      expect(routerMock.replace).not.toHaveBeenCalled();
    },
  );
});
