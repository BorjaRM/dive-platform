import { CatalogPanel } from '@/features/dashboard/catalog-panel';

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;
  return <CatalogPanel view={{ kind: 'edit', activityId }} />;
}
