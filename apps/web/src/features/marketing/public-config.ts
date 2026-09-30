export type PublicProductConfig = {
  canonicalOrigin: URL;
  contactEmail: string;
  indexable: boolean;
};

type Environment = Record<string, string | undefined>;

const contactEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function readPublicProductConfig(
  environment: Environment = process.env,
): PublicProductConfig {
  const canonicalOrigin = parseCanonicalOrigin(
    requiredEnvironmentValue(environment, 'PUBLIC_PRODUCT_ORIGIN'),
  );
  const contactEmail = requiredEnvironmentValue(
    environment,
    'PUBLIC_PRODUCT_CONTACT_EMAIL',
  );
  const indexableValue = requiredEnvironmentValue(
    environment,
    'PUBLIC_PRODUCT_INDEXABLE',
  );

  if (!contactEmailPattern.test(contactEmail)) {
    throw new Error('PUBLIC_PRODUCT_CONTACT_EMAIL must be a valid email');
  }

  if (indexableValue !== 'true' && indexableValue !== 'false') {
    throw new Error('PUBLIC_PRODUCT_INDEXABLE must be true or false');
  }

  return {
    canonicalOrigin,
    contactEmail,
    indexable: indexableValue === 'true',
  };
}

function requiredEnvironmentValue(
  environment: Environment,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Missing required public product configuration: ${name}`);
  }
  return value;
}

function parseCanonicalOrigin(value: string): URL {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error('PUBLIC_PRODUCT_ORIGIN must be a valid absolute URL');
  }

  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.hostname.startsWith('www.')
  ) {
    throw new Error(
      'PUBLIC_PRODUCT_ORIGIN must be an apex origin without a path or credentials',
    );
  }

  return origin;
}
