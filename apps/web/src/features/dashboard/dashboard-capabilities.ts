import { queryOptions } from '@tanstack/react-query';
import type { DashboardApi } from './tenant-context';

// Shared by the home and the workspace navigation so both observe one request.
export function dashboardCapabilitiesQuery(
  api: DashboardApi,
  context: string,
  centerId: string,
) {
  return queryOptions({
    queryKey: ['dashboard', 'catalog', 'home', 'capabilities', centerId],
    queryFn: ({ signal }) =>
      api.getDashboardCapabilities(context, centerId, signal),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}
