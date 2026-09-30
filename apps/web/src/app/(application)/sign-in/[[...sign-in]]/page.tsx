import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { readApplicationHostConfig } from '@/lib/application-hosts';

export const metadata: Metadata = {
  title: 'Sign in | BlueCurrent',
  description: 'Sign in to the BlueCurrent operations console.',
};

export default async function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthConfigurationMissing />;
  }
  const returnUrl =
    (await headers()).get('x-dive-center-return') ??
    `${readApplicationHostConfig().authenticationOrigin}/dashboard`;
  return (
    <main className="bootstrap-shell auth-shell">
      <section className="bootstrap-intro" aria-labelledby="sign-in-title">
        <p className="bootstrap-brand">BlueCurrent</p>
        <div>
          <p className="bootstrap-kicker">Operations console</p>
          <h1 id="sign-in-title">Welcome back below the surface.</h1>
          <p>Sign in with your existing team account.</p>
        </div>
        <p className="bootstrap-caption">Authorized team members only</p>
      </section>
      <section className="bootstrap-workspace" aria-label="Sign in form">
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
    <main className="bootstrap-status-page">
      <section className="bootstrap-notice" role="status">
        <p className="bootstrap-kicker">BlueCurrent</p>
        <h1>Authentication is unavailable</h1>
        <p>Contact support to continue.</p>
      </section>
    </main>
  );
}
