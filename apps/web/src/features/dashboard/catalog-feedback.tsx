import { Notice } from '../../components/ui/controls';

import { DashboardApiError } from './tenant-context';

export function describeCatalogError(error: unknown) {
  if (error instanceof DashboardApiError) {
    return error.problem?.code ?? `Request failed (${error.status}).`;
  }
  if (error instanceof Error) return error.message;
  return 'The catalog request could not be completed.';
}

export function CatalogNotice({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <Notice variant="panel" tone="warning" role="status">
      <strong>{title}</strong>
      {message && <span>{message}</span>}
    </Notice>
  );
}
