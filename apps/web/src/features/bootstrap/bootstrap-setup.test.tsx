import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootstrapSetup } from './bootstrap-setup';

const routerMock = vi.hoisted(() => ({ replace: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn());
const clerkMock = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  isLoaded: true,
  isSignedIn: true,
}));
const apiMock = vi.hoisted(() => ({ completeTenantBootstrap: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));
vi.mock('@clerk/nextjs', () => ({
  useAuth: useAuthMock,
}));
vi.mock('./bootstrap-api', () => ({
  BootstrapApiError: class BootstrapApiError extends Error {
    readonly status: number;

    constructor(status: number) {
      super('bootstrap_failed');
      this.status = status;
    }
  },
  completeTenantBootstrap: apiMock.completeTenantBootstrap,
}));

describe('BootstrapSetup', () => {
  beforeEach(() => {
    clerkMock.isLoaded = true;
    clerkMock.isSignedIn = true;
    clerkMock.getToken.mockResolvedValue('session-token');
    useAuthMock.mockReturnValue(clerkMock);
    apiMock.completeTenantBootstrap.mockResolvedValue({
      operatorRef: 'operator-ref',
      centerRef: 'center-ref',
    });
    routerMock.replace.mockReset();
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-US',
    });
  });

  afterEach(() => {
    cleanup();
    clerkMock.getToken.mockReset();
    apiMock.completeTenantBootstrap.mockReset();
    useAuthMock.mockReset();
  });

  it('does not access Clerk when configuration is unavailable', () => {
    render(<BootstrapSetup apiBaseUrl="" clerkConfigured={false} />);

    expect(
      screen.getByRole('heading', { name: 'Setup is unavailable' }),
    ).toBeInTheDocument();
    expect(useAuthMock).not.toHaveBeenCalled();
  });

  it('redirects a signed-out visitor to ordinary sign-in', async () => {
    clerkMock.isSignedIn = false;

    render(
      <BootstrapSetup apiBaseUrl="https://api.example.test" clerkConfigured />,
    );

    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/sign-in');
    });
    expect(apiMock.completeTenantBootstrap).not.toHaveBeenCalled();
  });

  it('requires time-zone confirmation and submits only the approved fields', async () => {
    render(
      <BootstrapSetup apiBaseUrl="https://api.example.test" clerkConfigured />,
    );

    fireEvent.change(await screen.findByLabelText('Operation name'), {
      target: { value: 'Ocean North' },
    });
    fireEvent.change(screen.getByLabelText('First center name'), {
      target: { value: 'Harbor Base' },
    });
    fireEvent.change(screen.getByLabelText('Center time zone'), {
      target: { value: 'Atlantic/Canary' },
    });
    const form = screen
      .getByRole('button', {
        name: 'Create operation',
      })
      .closest('form');
    if (!form) throw new Error('Expected setup form');

    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirm the time zone to continue.',
    );
    expect(apiMock.completeTenantBootstrap).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'I confirm this is the center’s local time zone.',
      }),
    );
    fireEvent.submit(form);

    await waitFor(() => {
      expect(apiMock.completeTenantBootstrap).toHaveBeenCalledWith({
        apiBaseUrl: 'https://api.example.test',
        getToken: clerkMock.getToken,
        input: {
          operatorDisplayName: 'Ocean North',
          centerDisplayName: 'Harbor Base',
          timeZone: 'Atlantic/Canary',
          locale: 'en',
        },
      });
    });
    expect(routerMock.replace).toHaveBeenCalledWith('/dashboard');
  });
});
