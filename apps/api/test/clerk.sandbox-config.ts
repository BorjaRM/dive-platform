export function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function sandboxDatabaseUrl(
  name: string,
  expectedUsername: string,
): string {
  const value = requiredEnvironment(name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}`);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55432' ||
    url.pathname !== '/dive_spike' ||
    decodeURIComponent(url.username) !== expectedUsername ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must target the local dive_spike sandbox database on port 55432`,
    );
  }
  return value;
}

export function canonicalHttpsOrigin(name: string): string {
  const value = requiredEnvironment(name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.origin !== value
  ) {
    throw new Error(`${name} must be a canonical HTTPS origin`);
  }
  return value;
}
