import { createHash, timingSafeEqual } from 'node:crypto';
import type { Environment } from '../config/environment.js';

const configurationName = 'BFF_SERVICE_CREDENTIAL_VERIFIERS';

export class BffServiceCredentialVerifier {
  private readonly hashesByVersion = new Map<string, Buffer>();

  constructor(environment: Environment) {
    const configuration = environment[configurationName]?.trim();
    if (!configuration) throw new Error(`Missing ${configurationName}`);

    let verifiers: unknown;
    try {
      verifiers = JSON.parse(configuration);
    } catch {
      throw new Error(`Invalid ${configurationName}`);
    }
    if (!Array.isArray(verifiers) || verifiers.length === 0) {
      throw new Error(`Invalid ${configurationName}`);
    }

    for (const verifier of verifiers) {
      if (
        !verifier ||
        typeof verifier !== 'object' ||
        Array.isArray(verifier) ||
        Object.keys(verifier).length !== 2 ||
        typeof verifier.version !== 'string' ||
        !verifier.version ||
        /[^A-Za-z0-9_-]/.test(verifier.version) ||
        typeof verifier.sha256 !== 'string' ||
        verifier.sha256.length !== 64 ||
        /[^a-f0-9]/.test(verifier.sha256) ||
        this.hashesByVersion.has(verifier.version)
      ) {
        throw new Error(`Invalid ${configurationName}`);
      }
      this.hashesByVersion.set(
        verifier.version,
        Buffer.from(verifier.sha256, 'hex'),
      );
    }
  }

  authenticate(header: string | readonly string[] | undefined): boolean {
    if (typeof header !== 'string') return false;
    const credential = header.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/);
    if (!credential || credential[0] !== header) return false;

    const [, version, encodedSecret] = credential;
    if (!version || !encodedSecret) return false;
    const expectedHash = this.hashesByVersion.get(version);
    if (!expectedHash) return false;

    const secret = Buffer.from(encodedSecret, 'base64url');
    if (
      secret.length !== 32 ||
      secret.toString('base64url') !== encodedSecret
    ) {
      return false;
    }

    const presentedHash = createHash('sha256').update(secret).digest();
    return timingSafeEqual(expectedHash, presentedHash);
  }
}
