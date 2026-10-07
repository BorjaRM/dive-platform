import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import styles from '@/components/ui/access.module.css';
import {
  classifyApplicationHost,
  readApplicationHostConfig,
} from '@/lib/application-hosts';

export const metadata: Metadata = {
  title: 'Sign in | BlueCurrent',
  description: 'Sign in to the BlueCurrent operations console.',
};

export default async function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthConfigurationMissing />;
  }
  const requestHeaders = await headers();
  const hostConfig = readApplicationHostConfig();
  const surface = classifyApplicationHost(
    requestHeaders.get('host'),
    hostConfig,
  );
  const returnUrl =
    requestHeaders.get('x-dive-platform-return') ??
    requestHeaders.get('x-dive-center-return') ??
    (surface.kind === 'center'
      ? `${surface.origin}/dashboard`
      : `${hostConfig.authenticationOrigin}/dashboard`);
  return (
    <main className={styles.shell}>
      <section className={styles.intro} aria-labelledby="sign-in-title">
        <p className={styles.brand}>BlueCurrent</p>
        <div>
          <p className={styles.kicker}>Operations console</p>
          <h1 id="sign-in-title">Welcome back below the surface.</h1>
          <p>Sign in with your existing team account.</p>
        </div>
        <p className={styles.caption}>Authorized team members only</p>
      </section>
      <section className={styles.workspace} aria-label="Sign in form">
        <SignIn
          path="/sign-in"
          routing="path"
          withSignUp={false}
          fallbackRedirectUrl="/dashboard"
          forceRedirectUrl={returnUrl}
        />
      </section>
    </main>
  );
}

function AuthConfigurationMissing() {
  return (
    <main className={styles.statusPage}>
      <section className={styles.notice} role="status">
        <p className={styles.kicker}>BlueCurrent</p>
        <h1>Authentication is unavailable</h1>
        <p>Contact support to continue.</p>
      </section>
    </main>
  );
}
