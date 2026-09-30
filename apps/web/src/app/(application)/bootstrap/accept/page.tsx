import type { Metadata } from 'next';
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
    <main className="bootstrap-status-page">
      <section className="bootstrap-notice" role="status">
        <p className="bootstrap-kicker">Invitation access</p>
        <h1>This invitation cannot be opened</h1>
        <p>Contact support or request a new invitation.</p>
      </section>
    </main>
  );
}
