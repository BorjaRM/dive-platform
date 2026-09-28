'use client';

import { createContext, useContext } from 'react';
import type {
  Center,
  DashboardApi,
  SessionTokenSource,
} from './tenant-context';

export type DashboardSessionState =
  | 'checking'
  | 'available'
  | 'expired'
  | 'unavailable'
  | 'logged-out';

export type DashboardContextValue = {
  api: DashboardApi;
  apiBaseUrl: string;
  session: SessionTokenSource;
  tenantContext: string | null;
  authorizedCenters: Center[];
  sessionState: DashboardSessionState;
  isReady: boolean;
  invalidateDashboardCache: () => void;
  handleSessionExpired: () => void;
  clearTenantContext: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardContextProvider({
  value,
  children,
}: {
  value: DashboardContextValue;
  children: React.ReactNode;
}) {
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error(
      'useDashboardContext must be used within DashboardContextProvider',
    );
  }
  return context;
}
