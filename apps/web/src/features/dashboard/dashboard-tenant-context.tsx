'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DashboardContextProvider,
  type DashboardSessionState,
} from './dashboard-context';
import {
  createBrowserTenantContextStorage,
  createDashboardApi,
  DASHBOARD_QUERY_KEYS,
  DashboardApiError,
  type Operator,
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
  children?: React.ReactNode;
};

type RecoveryState = 'forbidden' | null;
type ActionNotice = 'revocation-failed' | 'logout-failed' | null;

export function DashboardTenantContext({
  apiBaseUrl,
  requestTimeoutMillis,
  session = unavailableSession,
  storage,
  children,
}: DashboardTenantContextProps) {
  const queryClient = useQueryClient();
  const [contextStorage, setContextStorage] =
    useState<TenantContextStorage | null>(storage ?? null);
  const api = useMemo(
    () =>
      createDashboardApi({
        baseUrl: apiBaseUrl ?? '',
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
  const sessionRef = useRef(session);
  const browserStorageRef = useRef<TenantContextStorage | null>(null);

  const clearDashboardCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: DASHBOARD_QUERY_KEYS.root });
  }, [queryClient]);

  const clearContext = useCallback(
    (nextRecovery: RecoveryState = null) => {
      if (!contextStorage) return;
      contextStorage.clear();
      setTenantContext(null);
      clearDashboardCache();
      setRecovery(nextRecovery);
    },
    [clearDashboardCache, contextStorage],
  );

  const expireSession = useCallback(() => {
    setSessionState('expired');
    clearContext();
  }, [clearContext]);

  useEffect(() => {
    if (!browserStorageRef.current && !storage) {
      browserStorageRef.current = createBrowserTenantContextStorage();
    }
    const nextStorage = storage ?? browserStorageRef.current;
    if (!nextStorage) return;
    setContextStorage(nextStorage);
    try {
      const storedContext = nextStorage.read();
      if (sessionState === 'expired') {
        nextStorage.clear();
        setTenantContext(null);
        clearDashboardCache();
      } else {
        setTenantContext(storedContext);
      }
    } finally {
      setStorageReady(true);
    }
  }, [clearDashboardCache, sessionState, storage]);

  // The retry signal intentionally retriggers this effect without rechecking after logout.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionCheck is an explicit retry signal
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
        if (active) {
          if (token) setSessionState('available');
          else setSessionState('expired');
        }
      },
      (error) => {
        settleProbe();
        if (active) setSessionState('expired');
        if (
          error instanceof DashboardApiError &&
          error.kind === 'unavailable'
        ) {
          if (active) setSessionState('unavailable');
        }
      },
    );
    return () => {
      active = false;
      probeController.abort();
      if (probeTimeout !== undefined) clearTimeout(probeTimeout);
    };
  }, [apiBaseUrl, requestTimeoutMillis, session, sessionCheck]);

  useEffect(() => {
    if (sessionRef.current === session) return;
    sessionRef.current = session;
    clearContext();
    setAutomaticSelectionAttempted(false);
    setRecovery(null);
    setSessionState('checking');
  }, [clearContext, session]);

  const operatorsQuery = useQuery({
    queryKey: [
      ...DASHBOARD_QUERY_KEYS.operators,
      operatorSelectionVersion,
    ] as const,
    queryFn: ({ signal }) => api.listOperators(signal),
    enabled:
      storageReady && sessionState === 'available' && tenantContext === null,
    retry: false,
  });

  const centersQuery = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.centers,
    queryFn: ({ signal }) => api.listCenters(tenantContext as string, signal),
    enabled:
      storageReady && sessionState === 'available' && tenantContext !== null,
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

  useEffect(() => {
    const error = operatorsQuery.error;
    if (
      error instanceof DashboardApiError &&
      error.kind === 'session-expired'
    ) {
      expireSession();
    }
  }, [expireSession, operatorsQuery.error]);

  useEffect(() => {
    const error = centersQuery.error;
    if (!(error instanceof DashboardApiError)) return;
    if (error.kind === 'session-expired') {
      expireSession();
      return;
    }
    if (error.kind === 'forbidden') {
      clearDashboardCache();
      setRecovery('forbidden');
    }
  }, [centersQuery.error, clearDashboardCache, expireSession]);

  useEffect(() => {
    const operators = operatorsQuery.data?.operators;
    if (
      operators?.length === 1 &&
      !automaticSelectionAttempted &&
      !issueContextMutation.isPending
    ) {
      setAutomaticSelectionAttempted(true);
      issueContextMutation.mutate();
    }
  }, [
    automaticSelectionAttempted,
    issueContextMutation,
    operatorsQuery.data?.operators,
  ]);

  const retrySession = () => {
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
        setSessionState('expired');
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
    authorizedCenters: centersQuery.data ?? [],
    sessionState,
    isReady:
      storageReady && sessionState === 'available' && tenantContext !== null,
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
          message="Set NEXT_PUBLIC_DASHBOARD_API_URL and connect an authenticated session token source before using the dashboard."
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

  if (sessionState === 'checking') {
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
            <button type="button" onClick={retrySession}>
              Check session again
            </button>
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

  if (recovery === 'forbidden') {
    return renderWithDashboardContext(
      <DashboardShell eyebrow="Dashboard" title="Choose a workspace again">
        <StatusPanel
          title="Access to this workspace was denied"
          message="Choose an active operator to establish a new context."
          action={
            <button type="button" onClick={chooseOperator}>
              Choose operator
            </button>
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
    <>
      <DashboardShell
        eyebrow="Authenticated dashboard"
        title="Your dive operation"
        action={
          <div className="dashboard-actions">
            <button type="button" onClick={() => void changeWorkspace()}>
              Change workspace
            </button>
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        }
      >
        <section
          className="dashboard-section"
          aria-labelledby="centers-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Tenant-scoped data</p>
              <h2 id="centers-heading">Centers</h2>
            </div>
            <span className="context-badge">Context active</span>
          </div>
          {centersQuery.isPending && (
            <StatusPanel
              title="Loading centers"
              message="Reading current access from the server."
            />
          )}
          {centersQuery.error && !centersQuery.isPending && (
            <StatusPanel
              title="Centers could not be loaded"
              message="The dashboard request was denied or unavailable."
            />
          )}
          {!centersQuery.error &&
            centersQuery.data &&
            centersQuery.data.length === 0 && (
              <StatusPanel
                title="No centers available"
                message="Your active operator has no readable centers in this context."
              />
            )}
          {!centersQuery.error &&
            centersQuery.data &&
            centersQuery.data.length > 0 && (
              <ul className="center-list">
                {centersQuery.data.map((center) => (
                  <li key={center.id} className="center-row">
                    <span className="center-mark" aria-hidden="true" />
                    <span>
                      <strong>{center.name}</strong>
                      <small>Current server-authorized center</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </DashboardShell>
      {children}
    </>,
  );
}

function OperatorSelection({
  isLoading,
  operators,
  error,
  notice,
  onSelect,
}: {
  isLoading: boolean;
  operators: Operator[];
  error: Error | null;
  notice: ActionNotice;
  onSelect: (operator: Operator) => void;
}) {
  if (isLoading) {
    return (
      <StatusPanel
        title="Loading operators"
        message="Finding your active memberships."
      />
    );
  }
  if (error) {
    return (
      <StatusPanel
        title="Operators could not be loaded"
        message="The dashboard could not read your active memberships."
      />
    );
  }
  if (operators.length === 0) {
    return (
      <StatusPanel
        title="No active operator memberships"
        message="There is no dashboard workspace available for this account."
      />
    );
  }

  return (
    <section className="dashboard-section" aria-labelledby="operators-heading">
      {notice === 'revocation-failed' && (
        <StatusPanel
          title="Previous workspace cleanup needs attention"
          message="The local context was removed, but the server could not confirm revocation. A new workspace can still be selected."
        />
      )}
      <div className="section-heading">
        <div>
          <p className="section-kicker">Active memberships</p>
          <h2 id="operators-heading">Select an operator</h2>
        </div>
        <span className="operator-count">{operators.length} available</span>
      </div>
      <div className="operator-list">
        {operators.map((operator) => (
          <button
            type="button"
            className="operator-option"
            key={operator.operatorRef}
            onClick={() => onSelect(operator)}
          >
            <span>
              <strong>{operator.displayName}</strong>
              <small>Open tenant workspace</small>
            </span>
            <span className="arrow" aria-hidden="true">
              -&gt;
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DashboardShell({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="dashboard-page">
      <div className="dashboard-orbit orbit-one" aria-hidden="true" />
      <div className="dashboard-orbit orbit-two" aria-hidden="true" />
      <div className="dashboard-frame">
        <header className="dashboard-header">
          <div>
            <p className="brand-mark">BLUECURRENT</p>
            <p className="dashboard-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          {action}
        </header>
        {children}
      </div>
    </main>
  );
}

function StatusPanel({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="status-panel" role="status">
      <span className="status-line" aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action && <div className="status-action">{action}</div>}
      </div>
    </section>
  );
}
