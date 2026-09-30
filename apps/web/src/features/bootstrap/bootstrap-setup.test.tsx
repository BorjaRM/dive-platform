import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootstrapApiError } from './bootstrap-api';
import { BootstrapSetup } from './bootstrap-setup';

const routerMock = vi.hoisted(() => ({ replace: vi.fn() }));
const navigateMock = vi.hoisted(() => vi.fn());
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
      tenantId: 'tenant-id',
      centerId: 'center-id',
      membershipId: 'membership-id',
      centerKey: 'harbor-base',
    });
    routerMock.replace.mockReset();
    navigateMock.mockReset();
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
      <BootstrapSetup
        apiBaseUrl="https://api.example.test"
        clerkConfigured
        centerAppBaseDomain="app.example.test"
        navigate={navigateMock}
      />,
    );

    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/sign-in');
    });
    expect(apiMock.completeTenantBootstrap).not.toHaveBeenCalled();
  });

  it('requires time-zone confirmation and submits only the approved fields', async () => {
    render(
      <BootstrapSetup
        apiBaseUrl="https://api.example.test"
        clerkConfigured
        centerAppBaseDomain="app.example.test"
        navigate={navigateMock}
      />,
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
    expect(navigateMock).toHaveBeenCalledWith(
      'https://harbor-base.app.example.test/dashboard',
    );
    expect(routerMock.replace).not.toHaveBeenCalledWith('/dashboard');
  });

  it.each([
    [401, 'Your session expired. Sign in again.'],
    [
      403,
      'Setup could not be completed. Check your invitation or contact support.',
    ],
  ])(
    'reports registration failure %s without navigating to the dashboard (DIVE-ONB-REQ-041)',
    async (status, message) => {
      apiMock.completeTenantBootstrap.mockRejectedValue(
        new BootstrapApiError(status, 'bootstrap_unavailable'),
      );

      render(
        <BootstrapSetup
          apiBaseUrl="https://api.example.test"
          clerkConfigured
          centerAppBaseDomain="app.example.test"
          navigate={navigateMock}
        />,
      );
      fireEvent.change(await screen.findByLabelText('Operation name'), {
        target: { value: 'Ocean North' },
      });
      fireEvent.change(screen.getByLabelText('First center name'), {
        target: { value: 'Harbor Base' },
      });
      fireEvent.change(screen.getByLabelText('Center time zone'), {
        target: { value: 'Europe/Madrid' },
      });
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I confirm this is the center’s local time zone.',
        }),
      );
      const form = screen
        .getByRole('button', { name: 'Create operation' })
        .closest('form');
      if (!form) throw new Error('Expected setup form');
      fireEvent.submit(form);

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(routerMock.replace).not.toHaveBeenCalledWith('/dashboard');
      expect(navigateMock).not.toHaveBeenCalled();
    },
  );
});
