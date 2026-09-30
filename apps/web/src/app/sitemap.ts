import type { MetadataRoute } from 'next';
import { readPublicProductConfig } from '../features/marketing/public-config';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const config = readPublicProductConfig();

  if (!config.indexable) {
    return [];
  }

  return [
    {
      url: config.canonicalOrigin.origin,
      changeFrequency: 'yearly',
      priority: 1,
    },
  ];
}
