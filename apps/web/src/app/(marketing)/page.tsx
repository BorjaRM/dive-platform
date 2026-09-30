import type { Metadata } from 'next';
import { MarketingLanding } from '../../features/marketing/marketing-landing';
import { readPublicProductConfig } from '../../features/marketing/public-config';

export const dynamic = 'force-dynamic';

const title = 'BlueCurrent | Gestión para centros de buceo';
const description =
  'BlueCurrent reúne la planificación y la operación diaria de tu centro de buceo en un solo lugar.';

export async function generateMetadata(): Promise<Metadata> {
  const config = readPublicProductConfig();
  const canonicalUrl = config.canonicalOrigin.origin;

  return {
    metadataBase: config.canonicalOrigin,
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: {
      index: config.indexable,
      follow: config.indexable,
      googleBot: {
        index: config.indexable,
        follow: config.indexable,
      },
    },
    openGraph: {
      type: 'website',
      locale: 'es_ES',
      url: canonicalUrl,
      siteName: 'BlueCurrent',
      title,
      description,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function MarketingPage() {
  const { contactEmail } = readPublicProductConfig();
  return <MarketingLanding contactEmail={contactEmail} />;
}
