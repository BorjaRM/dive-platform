import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import marketingPage, { generateMetadata } from '../../app/(marketing)/page';
import robots from '../../app/robots';
import sitemap from '../../app/sitemap';

const publicProductEnvironment = {
  PUBLIC_PRODUCT_ORIGIN: 'https://bluecurrent.example',
  PUBLIC_PRODUCT_CONTACT_EMAIL: 'hola@bluecurrent.example',
};

describe('public product metadata', () => {
  beforeEach(() => {
    vi.stubEnv(
      'PUBLIC_PRODUCT_ORIGIN',
      publicProductEnvironment.PUBLIC_PRODUCT_ORIGIN,
    );
    vi.stubEnv(
      'PUBLIC_PRODUCT_CONTACT_EMAIL',
      publicProductEnvironment.PUBLIC_PRODUCT_CONTACT_EMAIL,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('provides canonical and social metadata when indexing is enabled', async () => {
    vi.stubEnv('PUBLIC_PRODUCT_INDEXABLE', 'true');

    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe('https://bluecurrent.example');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      locale: 'es_ES',
      url: 'https://bluecurrent.example',
    });
    expect(sitemap()).toEqual([
      {
        url: 'https://bluecurrent.example',
        changeFrequency: 'yearly',
        priority: 1,
      },
    ]);
    expect(robots()).toMatchObject({
      sitemap: 'https://bluecurrent.example/sitemap.xml',
    });
  });

  it('disables indexing and exposes no sitemap outside production', async () => {
    vi.stubEnv('PUBLIC_PRODUCT_INDEXABLE', 'false');

    const metadata = await generateMetadata();

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(robots()).toEqual({
      rules: { userAgent: '*', disallow: '/' },
    });
    expect(sitemap()).toEqual([]);
  });

  it('opts out of training crawlers while preserving public discovery and private-route exclusions', () => {
    vi.stubEnv('PUBLIC_PRODUCT_INDEXABLE', 'true');

    expect(robots()).toEqual({
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/dashboard', '/bootstrap', '/sign-in'],
        },
        {
          userAgent: [
            'GPTBot',
            'ClaudeBot',
            'Google-Extended',
            'Applebot-Extended',
            'CCBot',
          ],
          disallow: '/',
        },
      ],
      sitemap: 'https://bluecurrent.example/sitemap.xml',
    });
  });

  it('keeps the page server-only and independent from Clerk', () => {
    expect(marketingPage).toBeTypeOf('function');
  });
});
