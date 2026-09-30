import type { Metadata } from 'next';
import styles from '@/components/ui/access.module.css';
import { BootstrapAcceptance } from '@/features/bootstrap/bootstrap-acceptance';

export const metadata: Metadata = {
  title: 'Accept invitation | BlueCurrent',
  robots: { index: false, follow: false },
};

export default function BootstrapAcceptPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <BootstrapUnavailable />;
  }
  return <BootstrapAcceptance />;
}

function BootstrapUnavailable() {
  return (
    <main className={styles.statusPage}>
      <section className={styles.notice} role="status">
        <p className={styles.kicker}>Invitation access</p>
        <h1>This invitation cannot be opened</h1>
        <p>Contact support or request a new invitation.</p>
      </section>
    </main>
  );
}
