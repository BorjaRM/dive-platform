import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BootstrapSetupPage from '../../app/(application)/bootstrap/setup/page';
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
const timeZones = ['Atlantic/Canary', 'Europe/Madrid', 'America/New_York'];

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
    const dateTimeOptions = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...dateTimeOptions,
      timeZone: 'Europe/Madrid',
    });
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clerkMock.getToken.mockReset();
    apiMock.completeTenantBootstrap.mockReset();
    useAuthMock.mockReset();
  });

  it('does not access Clerk when configuration is unavailable', () => {
    render(
      <BootstrapSetup
        apiBaseUrl=""
        clerkConfigured={false}
        timeZones={timeZones}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Setup is unavailable' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('BlueCurrent');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Contact support if the problem continues.',
    );
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
        timeZones={timeZones}
      />,
    );

    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/sign-in');
    });
    expect(
      screen.getByRole('heading', { name: 'Checking your session' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Contact support if the problem continues.',
    );
    expect(apiMock.completeTenantBootstrap).not.toHaveBeenCalled();
  });

  it('requires time-zone confirmation and submits only the approved fields', async () => {
    render(
      <BootstrapSetup
        apiBaseUrl="https://api.example.test"
        clerkConfigured
        centerAppBaseDomain="app.example.test"
        navigate={navigateMock}
        timeZones={timeZones}
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

  it('generates the option list in the server page (DIVE-ONB-REQ-022)', () => {
    vi.stubEnv('CENTER_APP_BASE_DOMAIN', 'app.example.test');
    vi.stubEnv('AUTHENTICATION_ORIGIN', 'https://auth.example.test');
    vi.stubEnv('CENTER_APP_BASE_ORIGIN', 'https://app.example.test');
    const enumeration = vi
      .spyOn(Intl, 'supportedValuesOf')
      .mockReturnValue(timeZones);

    const page = BootstrapSetupPage();

    expect(enumeration).toHaveBeenCalledWith('timeZone');
    expect(page.props.timeZones).toEqual(timeZones);
  });

  it('includes and preselects a browser zone absent from server options (DIVE-ONB-REQ-022)', () => {
    render(
      <BootstrapSetup
        apiBaseUrl="/api/dashboard"
        clerkConfigured
        centerAppBaseDomain="app.example.test"
        timeZones={['Atlantic/Canary']}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Center time zone' }),
    ).toHaveValue('Europe/Madrid');
    expect(
      screen.getByRole('option', { name: 'Madrid (Europe/Madrid)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('filters options without changing selection and clears confirmation on selection changes (DIVE-ONB-REQ-022)', () => {
    render(
      <BootstrapSetup
        apiBaseUrl="/api/dashboard"
        clerkConfigured
        centerAppBaseDomain="app.example.test"
        timeZones={timeZones}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search time zones' }),
      {
        target: { value: 'new york' },
      },
    );

    const selector = screen.getByRole('combobox', { name: 'Center time zone' });
    expect(selector).toHaveValue('Europe/Madrid');
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(
      screen.queryByRole('option', { name: 'Canary (Atlantic/Canary)' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'New York (America/New_York)' }),
    ).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'America/New_York' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'not-a-zone' },
    });
    expect(selector).toHaveValue('America/New_York');
    expect(
      screen.queryByRole('option', { name: 'not-a-zone' }),
    ).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: 'not-a-zone' } });
    fireEvent.click(screen.getByRole('checkbox'));
    const form = selector.closest('form');
    if (!form) throw new Error('Expected setup form');
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select a time zone to continue.',
    );
    expect(apiMock.completeTenantBootstrap).not.toHaveBeenCalled();
  });

  it.each([
    { enumeration: 'missing', detection: 'missing' },
    { enumeration: 'missing', detection: 'throws' },
    { enumeration: 'throws', detection: 'missing' },
    { enumeration: 'throws', detection: 'throws' },
  ] as const)(
    'submits server options with browser enumeration $enumeration and detection $detection (DIVE-ONB-REQ-022)',
    async ({ enumeration, detection }) => {
      const browserEnumeration = vi
        .spyOn(Intl, 'supportedValuesOf')
        .mockImplementation(() => {
          throw new Error('Browser enumeration unavailable');
        });
      if (enumeration === 'missing') {
        vi.stubGlobal(
          'Intl',
          Object.create(Intl, {
            supportedValuesOf: { value: undefined },
          }),
        );
        expect(Intl.supportedValuesOf).toBeUndefined();
      }
      const detectionMock = vi.spyOn(
        Intl.DateTimeFormat.prototype,
        'resolvedOptions',
      );
      if (detection === 'throws') {
        detectionMock.mockImplementation(() => {
          throw new Error('Detection unavailable');
        });
      } else {
        detectionMock.mockReturnValue({
          ...Intl.DateTimeFormat().resolvedOptions(),
          timeZone: '',
        });
      }
      render(
        <BootstrapSetup
          apiBaseUrl="/api/dashboard"
          clerkConfigured
          centerAppBaseDomain="app.example.test"
          timeZones={timeZones}
          navigate={navigateMock}
        />,
      );
      const selector = screen.getByRole('combobox', {
        name: 'Center time zone',
      });
      expect(selector).toHaveValue('');
      fireEvent.change(screen.getByLabelText('Operation name'), {
        target: { value: 'Ocean North' },
      });
      fireEvent.change(screen.getByLabelText('First center name'), {
        target: { value: 'Harbor Base' },
      });
      const form = selector.closest('form');
      if (!form) throw new Error('Expected setup form');
      fireEvent.submit(form);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Select a time zone to continue.',
      );
      expect(apiMock.completeTenantBootstrap).not.toHaveBeenCalled();

      fireEvent.change(selector, { target: { value: 'Atlantic/Canary' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.submit(form);

      await waitFor(() =>
        expect(apiMock.completeTenantBootstrap).toHaveBeenCalledWith({
          apiBaseUrl: '/api/dashboard',
          getToken: clerkMock.getToken,
          input: {
            operatorDisplayName: 'Ocean North',
            centerDisplayName: 'Harbor Base',
            timeZone: 'Atlantic/Canary',
            locale: 'en',
          },
        }),
      );
      expect(browserEnumeration).not.toHaveBeenCalled();
    },
  );

  it('localizes search and selection labels in Spanish (DIVE-ONB-REQ-022)', () => {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'es-ES',
    });
    render(
      <BootstrapSetup
        apiBaseUrl="/api/dashboard"
        clerkConfigured
        centerAppBaseDomain="app.example.test"
        timeZones={timeZones}
      />,
    );

    expect(
      screen.getByRole('searchbox', { name: 'Buscar zona horaria' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Zona horaria del centro' }),
    ).toHaveValue('Europe/Madrid');
    expect(
      screen.getByRole('option', { name: 'Selecciona una zona horaria' }),
    ).toBeInTheDocument();
  });

  it.each(['test-center', 'ocean-north'])(
    'redirects successful local setup to the allocated center %s',
    async (centerKey) => {
      apiMock.completeTenantBootstrap.mockResolvedValue({ centerKey });
      render(
        <BootstrapSetup
          apiBaseUrl="http://localhost:3001"
          clerkConfigured
          centerAppBaseDomain="app.localhost"
          centerAppBaseOrigin="http://app.localhost:3000"
          navigate={navigateMock}
          timeZones={timeZones}
        />,
      );
      fireEvent.change(await screen.findByLabelText('Operation name'), {
        target: { value: 'Ocean North' },
      });
      fireEvent.change(screen.getByLabelText('First center name'), {
        target: { value: 'Another display name' },
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
      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith(
          `http://${centerKey}.app.localhost:3000/dashboard`,
        );
      });
    },
  );

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
          timeZones={timeZones}
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
