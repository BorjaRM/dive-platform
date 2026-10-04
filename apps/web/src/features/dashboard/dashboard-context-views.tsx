import type { ReactNode } from 'react';
import { Badge } from '../../components/ui/controls';
import styles from './dashboard.module.css';
import type { Center, Operator } from './tenant-context';

export function CentersSection({
  centers,
  isLoading,
  error,
}: {
  centers: Center[] | undefined;
  isLoading: boolean;
  error: Error | null;
}) {
  return (
    <section className={styles.section} aria-labelledby="centers-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>Tenant-scoped data</p>
          <h2 id="centers-heading">Centers</h2>
        </div>
        <Badge variant="count">Context active</Badge>
      </div>
      {isLoading && (
        <StatusPanel
          title="Loading centers"
          message="Reading current access from the server."
        />
      )}
      {error && !isLoading && (
        <StatusPanel
          title="Centers could not be loaded"
          message="The dashboard request was denied or unavailable."
        />
      )}
      {!error && centers && centers.length === 0 && (
        <StatusPanel
          title="No centers available"
          message="Your active operator has no readable centers in this context."
        />
      )}
      {!error && centers && centers.length > 0 && (
        <ul className={styles.centerList}>
          {centers.map((center) => (
            <li key={center.id} className={styles.centerRow}>
              <span className={styles.centerMark} aria-hidden="true" />
              <span>
                <strong>{center.name}</strong>
                <small>Current server-authorized center</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OperatorSelection({
  isLoading,
  operators,
  error,
  notice,
  onSelect,
}: {
  isLoading: boolean;
  operators: Operator[];
  error: Error | null;
  notice: 'revocation-failed' | 'logout-failed' | null;
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
    <section className={styles.section} aria-labelledby="operators-heading">
      {notice === 'revocation-failed' && (
        <StatusPanel
          title="Previous workspace cleanup needs attention"
          message="The local context was removed, but the server could not confirm revocation. A new workspace can still be selected."
        />
      )}
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>Active memberships</p>
          <h2 id="operators-heading">Select an operator</h2>
        </div>
        <Badge variant="count">{operators.length} available</Badge>
      </div>
      <div className={styles.operatorList}>
        {operators.map((operator) => (
          <button
            type="button"
            className={styles.operatorOption}
            key={operator.operatorRef}
            onClick={() => onSelect(operator)}
          >
            <span>
              <strong>{operator.displayName}</strong>
              <small>Open tenant workspace</small>
            </span>
            <span className={styles.arrow} aria-hidden="true">
              -&gt;
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DashboardShell({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div
        className={`${styles.orbit} ${styles.orbitOne}`}
        aria-hidden="true"
      />
      <div
        className={`${styles.orbit} ${styles.orbitTwo}`}
        aria-hidden="true"
      />
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.brandMark}>BLUECURRENT</p>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          {action}
        </header>
        {children}
      </div>
    </main>
  );
}

export function StatusPanel({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <section className={styles.statusPanel} role="status">
      <span className={styles.statusLine} aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action && <div className={styles.statusAction}>{action}</div>}
      </div>
    </section>
  );
}
