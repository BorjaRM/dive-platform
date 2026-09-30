import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

describe('public product proxy', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_PRODUCT_ORIGIN', 'https://bluecurrent.example');
    vi.stubEnv('PUBLIC_PRODUCT_CONTACT_EMAIL', 'hola@bluecurrent.example');
    vi.stubEnv('PUBLIC_PRODUCT_INDEXABLE', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves the canonical root without adding auth or tenant state', () => {
    const response = proxy(
      new NextRequest('https://bluecurrent.example/?source=direct'),
    );

    expect(response.status).toBe(200);
  });

  it('redirects www permanently while preserving the path and query', () => {
    const response = proxy(
      new NextRequest('https://www.bluecurrent.example/robots.txt?check=1'),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://bluecurrent.example/robots.txt?check=1',
    );
  });

  it.each([
    'https://center.app.bluecurrent.example/',
    'https://bluecurrent.preview.example/',
    'https://unknown.example/',
  ])('fails closed for %s', (url) => {
    expect(proxy(new NextRequest(url)).status).toBe(404);
  });

  it('does not apply the public host boundary to application routes', () => {
    expect(
      proxy(new NextRequest('https://unknown.example/dashboard')).status,
    ).toBe(200);
  });

  it('returns a configuration error instead of selecting a host default', () => {
    vi.stubEnv('PUBLIC_PRODUCT_ORIGIN', '');

    expect(proxy(new NextRequest('https://bluecurrent.example/')).status).toBe(
      500,
    );
  });
});
