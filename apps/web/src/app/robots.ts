import type { MetadataRoute } from 'next';
import { readPublicProductConfig } from '../features/marketing/public-config';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const config = readPublicProductConfig();

  if (!config.indexable) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/bootstrap', '/sign-in'],
    },
    sitemap: `${config.canonicalOrigin.origin}/sitemap.xml`,
  };
}
