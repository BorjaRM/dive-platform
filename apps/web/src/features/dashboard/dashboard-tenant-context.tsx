'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '../../components/ui/controls';
import styles from './dashboard.module.css';
import {
  DashboardContextProvider,
  type DashboardSessionState,
} from './dashboard-context';
import {
  CentersSection,
  DashboardShell,
  OperatorSelection,
  StatusPanel,
} from './dashboard-context-views';
import { DashboardWorkspace } from './dashboard-workspace';
import {
  createBrowserTenantContextStorage,
  createDashboardApi,
  DASHBOARD_BFF_BASE_PATH,
  DASHBOARD_QUERY_KEYS,
  DashboardApiError,
  type SessionTokenSource,
  type TenantContextStorage,
} from './tenant-context';

const unavailableSession: SessionTokenSource = {
  configured: false,
  getToken: async () => null,
};

type DashboardTenantContextProps = {
  apiBaseUrl?: string | undefined;
  requestTimeoutMillis?: number | undefined;
  session?: SessionTokenSource | undefined;
  storage?: TenantContextStorage | undefined;
  centerKey?: string | undefined;
  supportEmail?: string | undefined;
  onSessionExpired?: (() => void) | undefined;
  children?: React.ReactNode;
};

type RecoveryState = 'forbidden' | null;
type ActionNotice = 'revocation-failed' | 'logout-failed' | null;

export function DashboardTenantContext({
  apiBaseUrl,
  requestTimeoutMillis,
  session = unavailableSession,
  storage,
  centerKey,
  supportEmail,
  onSessionExpired,
  children,
}: DashboardTenantContextProps) {
  const queryClient = useQueryClient();
  const [contextStorage, setContextStorage] =
    useState<TenantContextStorage | null>(storage ?? null);
  const api = useMemo(
    () =>
      createDashboardApi({
        baseUrl: apiBaseUrl || DASHBOARD_BFF_BASE_PATH,
        session,
        requestTimeoutMillis,
      }),
    [apiBaseUrl, requestTimeoutMillis, session],
  );
  const [tenantContext, setTenantContext] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [sessionState, setSessionState] =
    useState<DashboardSessionState>('checking');
  const [recovery, setRecovery] = useState<RecoveryState>(null);
  const [actionNotice, setActionNotice] = useState<ActionNotice>(null);
  const [sessionCheck, setSessionCheck] = useState(0);
  const [automaticSelectionAttempted, setAutomaticSelectionAttempted] =
    useState(false);
  const [operatorSelectionVersion, setOperatorSelectionVersion] = useState(0);
  const [entryCenter, setEntryCenter] = useState<{
    centerKey: string;
    centerId: string;
  } | null>(null);
  const [contextSession, setContextSession] = useState(session);
  const contextIsCurrent = contextSession === session;
  const sessionExpiredRef = useRef(false);
  const browserStorageRef = useRef<TenantContextStorage | null>(null);

  const clearDashboardCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: DASHBOARD_QUERY_KEYS.root });
  }, [queryClient]);

  const clearContext = useCallback(
    (nextRecovery: RecoveryState = null) => {
      (contextStorage ?? browserStorageRef.current)?.clear();
      setTenantContext(null);
      setEntryCenter(null);
      clearDashboardCache();
      setRecovery(nextRecovery);
    },
    [clearDashboardCache, contextStorage],
  );

  const expireSession = useCallback(() => {
    if (sessionExpiredRef.current) return;
    sessionExpiredRef.current = true;
    setSessionState('expired');
    clearContext();
    onSessionExpired?.();
  }, [clearContext, onSessionExpired]);

  useEffect(() => {
    if (!browserStorageRef.current && !storage) {
      browserStorageRef.current = createBrowserTenantContextStorage();
    }
    const nextStorage = storage ?? browserStorageRef.current;
    if (!nextStorage) return;
    setContextStorage(nextStorage);
    try {
      const storedContext = nextStorage.read();
      if (sessionExpiredRef.current) {
        nextStorage.clear();
        setTenantContext(null);
        setEntryCenter(null);
        clearDashboardCache();
      } else {
        setEntryCenter(null);
        clearDashboardCache();
        setTenantContext(storedContext);
      }
    } finally {
      setStorageReady(true);
    }
  }, [clearDashboardCache, storage]);

  const completeSessionProbe = useEffectEvent(
    (
      probeSession: SessionTokenSource,
      attempt: number,
      result: { token: string | null } | { error: unknown },
    ) => {
      if (probeSession !== session || attempt !== sessionCheck) return;
      if ('token' in result) {
        if (result.token) setSessionState('available');
        else expireSession();
      } else if (
        result.error instanceof DashboardApiError &&
        result.error.kind === 'unavailable'
      ) {
        setSessionState('unavailable');
      } else {
        expireSession();
      }
    },
  );

  useEffect(() => {
    if (!apiBaseUrl) {
      setSessionState('unavailable');
      return;
    }
    if (session.configured === false) {
      setSessionState('unavailable');
      return;
    }

    let active = true;
    const probeController = new AbortController();
    let probeTimeout: ReturnType<typeof setTimeout> | undefined;
    const tokenCheck = session.getToken(probeController.signal);
    const boundedTokenCheck =
      requestTimeoutMillis === undefined
        ? tokenCheck
        : Promise.race([
            tokenCheck,
            new Promise<never>((_, reject) => {
              probeTimeout = setTimeout(() => {
                reject(new DashboardApiError(0, 'unavailable'));
                probeController.abort();
              }, requestTimeoutMillis);
            }),
          ]);
    const settleProbe = () => {
      if (probeTimeout !== undefined) clearTimeout(probeTimeout);
    };
    void boundedTokenCheck.then(
      (token) => {
        settleProbe();
        if (active) completeSessionProbe(session, sessionCheck, { token });
      },
      (error) => {
        settleProbe();
        if (active) completeSessionProbe(session, sessionCheck, { error });
      },
    );
    return () => {
      active = false;
      probeController.abort();
      if (probeTimeout !== undefined) clearTimeout(probeTimeout);
    };
  }, [apiBaseUrl, requestTimeoutMillis, session, sessionCheck]);

  useEffect(() => {
    if (contextIsCurrent) return;
    setContextSession(session);
    sessionExpiredRef.current = false;
    clearContext();
    setAutomaticSelectionAttempted(false);
    setRecovery(null);
    setSessionState('checking');
  }, [clearContext, contextIsCurrent, session]);

  const hasAvailableSession = contextIsCurrent && sessionState === 'available';
  const canEstablishTenantContext =
    hasAvailableSession && tenantContext === null && recovery === null;

  const operatorsQuery = useQuery({
    queryKey: [
      ...DASHBOARD_QUERY_KEYS.operators,
      operatorSelectionVersion,
    ] as const,
    queryFn: ({ signal }) => api.listOperators(signal),
    enabled:
      !centerKey &&
      storageReady &&
      hasAvailableSession &&
      tenantContext === null,
    retry: false,
  });

  const centerEntryQuery = useQuery({
    queryKey: [
      ...DASHBOARD_QUERY_KEYS.root,
      'center-entry',
      centerKey,
      sessionCheck,
    ],
    queryFn: ({ signal }) =>
      api.issueCenterEntryContext(centerKey as string, signal),
    enabled: Boolean(centerKey) && storageReady && canEstablishTenantContext,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (!centerKey || !canEstablishTenantContext) return;
    if (!centerEntryQuery.isSuccess || !centerEntryQuery.data) return;
    if (!contextStorage) return;
    const issued = centerEntryQuery.data;
    contextStorage.write(issued.tenantContext);
    setTenantContext(issued.tenantContext);
    setEntryCenter({ centerKey, centerId: issued.center.centerId });
  }, [
    centerEntryQuery.data,
    centerEntryQuery.isSuccess,
    centerKey,
    contextStorage,
    canEstablishTenantContext,
  ]);

  const currentEntryCenter =
    entryCenter?.centerKey === centerKey ? entryCenter : null;
  const centersQuery = useQuery({
    queryKey: centerKey
      ? [
          ...DASHBOARD_QUERY_KEYS.centers,
          centerKey,
          tenantContext,
          currentEntryCenter?.centerId,
        ]
      : DASHBOARD_QUERY_KEYS.centers,
    queryFn: async ({ signal }) => {
      if (centerKey && currentEntryCenter) {
        return [
          await api.getCenter(
            tenantContext as string,
            currentEntryCenter.centerId,
            signal,
          ),
        ];
      }
      const centers = await api.listCenters(tenantContext as string, signal);
      if (centerKey && centers.length > 1)
        throw new DashboardApiError(502, 'unavailable');
      return centers;
    },
    enabled:
      hasAvailableSession &&
      storageReady &&
      tenantContext !== null &&
      recovery === null,
    retry: false,
  });

  const issueContextMutation = useMutation({
    mutationFn: (operatorRef?: string) => api.issueTenantContext(operatorRef),
    onSuccess: ({ tenantContext: nextContext }) => {
      clearDashboardCache();
      contextStorage?.write(nextContext);
      setTenantContext(nextContext);
      setRecovery(null);
      setActionNotice(null);
    },
    onError: (error) => {
      if (
        error instanceof DashboardApiError &&
        error.kind === 'session-expired'
      ) {
        expireSession();
      }
    },
  });

  const querySessionExpired = [
    centerEntryQuery.error,
    operatorsQuery.error,
    centersQuery.error,
  ].some(
    (error) =>
      error instanceof DashboardApiError && error.kind === 'session-expired',
  );
  const centerEntryFailed = Boolean(centerKey && centerEntryQuery.error);
  const centersForbidden =
    centersQuery.error instanceof DashboardApiError &&
    centersQuery.error.kind === 'forbidden';
  useEffect(() => {
    if (!contextIsCurrent) return;
    if (querySessionExpired) {
      expireSession();
      return;
    }
    if (centerEntryFailed || (centersForbidden && centerKey)) {
      clearContext('forbidden');
    } else if (centersForbidden) {
      clearDashboardCache();
      setRecovery('forbidden');
    }
  }, [
    centerKey,
    contextIsCurrent,
    querySessionExpired,
    centerEntryFailed,
    centersForbidden,
    clearContext,
    clearDashboardCache,
    expireSession,
  ]);

  const { mutate: issueContext, isPending: contextIssuancePending } =
    issueContextMutation;
  const canAutomaticallySelectOperator =
    !centerKey &&
    canEstablishTenantContext &&
    operatorsQuery.data?.operators?.length === 1 &&
    !automaticSelectionAttempted &&
    !contextIssuancePending;
  useEffect(() => {
    if (!canAutomaticallySelectOperator) return;
    setAutomaticSelectionAttempted(true);
    issueContext();
  }, [canAutomaticallySelectOperator, issueContext]);

  const retrySession = () => {
    sessionExpiredRef.current = false;
    setSessionState('checking');
    setSessionCheck((current) => current + 1);
  };

  const chooseOperator = () => {
    clearContext();
    setOperatorSelectionVersion((current) => current + 1);
    setAutomaticSelectionAttempted(false);
    setRecovery(null);
  };

  const changeWorkspace = async () => {
    const currentContext = tenantContext;
    try {
      if (currentContext && sessionState === 'available') {
        await api.revokeTenantContext(currentContext);
      }
    } catch {
      setActionNotice('revocation-failed');
    } finally {
      clearContext();
      setAutomaticSelectionAttempted(false);
    }
  };

  const logout = async () => {
    const currentContext = tenantContext;
    let logoutFailed = false;
    try {
      if (currentContext && sessionState === 'available') {
        await api.revokeTenantContext(currentContext);
      }
    } catch (error) {
      logoutFailed = true;
      if (
        error instanceof DashboardApiError &&
        error.kind === 'session-expired'
      ) {
        expireSession();
      }
    }
    try {
      await session.logout?.();
    } catch {
      logoutFailed = true;
    } finally {
      clearContext();
      setActionNotice(logoutFailed ? 'logout-failed' : null);
      setSessionState('logged-out');
    }
  };

  const dashboardContextValue = {
    api,
    apiBaseUrl: apiBaseUrl ?? '',
    session,
    tenantContext,
    authorizedCenters:
      contextIsCurrent && recovery === null ? (centersQuery.data ?? []) : [],
    sessionState,
    isReady:
      contextIsCurrent &&
      storageReady &&
      sessionState === 'available' &&
      tenantContext !== null &&
      recovery === null &&
      (!centerKey ||
        (centersQuery.isSuccess && centersQuery.data?.length === 1)),
    invalidateDashboardCache: clearDashboardCache,
    handleSessionExpired: expireSession,
    clearTenantContext: () => clearContext(),
  };
  const renderWithDashboardContext = (content: React.ReactNode) => (
    <DashboardContextProvider value={dashboardContextValue}>
      {content}
    </DashboardContextProvider>
  );

  if (!apiBaseUrl) {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Authentication seam required">
        <StatusPanel
          title="Dashboard API is not configured"
          message="The dashboard connection is unavailable."
        />
      </DashboardShell>,
    );
  }

  if (sessionState === 'unavailable') {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Authentication seam required">
        <StatusPanel
          title="Sign-in is managed by the host application"
          message="This starter keeps the identity-provider boundary provider-neutral. Configure the web authentication provider before using the dashboard."
        />
      </DashboardShell>,
    );
  }

  if (!contextIsCurrent || sessionState === 'checking') {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Opening your workspace">
        <StatusPanel
          title="Checking your session"
          message="Preparing a secure dashboard request boundary."
        />
      </DashboardShell>,
    );
  }

  if (sessionState === 'expired') {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Session expired">
        <StatusPanel
          title="Your session is no longer available"
          message="Sign in again through the host application, then retry the dashboard."
          action={
            <Button type="button" onClick={retrySession}>
              Check session again
            </Button>
          }
        />
      </DashboardShell>,
    );
  }

  if (sessionState === 'logged-out') {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Dashboard context cleared">
        <StatusPanel
          title={
            actionNotice === 'logout-failed'
              ? 'Dashboard context cleared'
              : 'You are signed out of this dashboard'
          }
          message={
            actionNotice === 'logout-failed'
              ? 'The local tenant context was removed, but the host session cleanup needs attention.'
              : 'The tenant context was removed from this browser session. Sign in through the host application to return.'
          }
        />
      </DashboardShell>,
    );
  }

  if (centerKey && (recovery === 'forbidden' || centersQuery.error)) {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Center unavailable">
        <StatusPanel
          title="This center is unavailable"
          message="Access could not be established. Contact support to continue."
          action={
            <div className={styles.actions}>
              <Button type="button" onClick={() => window.history.back()}>
                Back
              </Button>
              <Button type="button" onClick={() => void logout()}>
                Log out
              </Button>
              {supportEmail && (
                <a href={`mailto:${supportEmail}`}>Contact support</a>
              )}
            </div>
          }
        />
      </DashboardShell>,
    );
  }

  if (centerKey && tenantContext === null) {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Opening your center">
        <StatusPanel
          title="Checking center access"
          message="Reading current access from the server."
        />
      </DashboardShell>,
    );
  }

  if (recovery === 'forbidden') {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Choose a workspace again">
        <StatusPanel
          title="Access to this workspace was denied"
          message="Choose an active operator to establish a new context."
          action={
            <Button type="button" onClick={chooseOperator}>
              Choose operator
            </Button>
          }
        />
      </DashboardShell>,
    );
  }

  if (tenantContext === null) {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Choose your workspace">
        <OperatorSelection
          isLoading={operatorsQuery.isPending || issueContextMutation.isPending}
          operators={operatorsQuery.data?.operators ?? []}
          error={issueContextMutation.error ?? operatorsQuery.error}
          notice={actionNotice}
          onSelect={(operator) =>
            issueContextMutation.mutate(operator.operatorRef)
          }
        />
      </DashboardShell>,
    );
  }

  return renderWithDashboardContext(
    <DashboardWorkspace
      hasCenterRoute={children !== undefined}
      actions={
        <>
          {!centerKey && (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => void changeWorkspace()}
            >
              Change workspace
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => void logout()}
          >
            Log out
          </Button>
        </>
      }
    >
      {children ?? (
        <CentersSection
          centers={centersQuery.data}
          isLoading={centersQuery.isPending}
          error={centersQuery.error}
        />
      )}
    </DashboardWorkspace>,
  );
}
