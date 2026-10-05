import Link from 'next/link';

export function CatalogHint({
  departments,
  designations,
  ready = true,
}: {
  departments: { id: string }[];
  designations: { id: string }[];
  ready?: boolean;
}) {
  if (!ready || (departments.length > 0 && designations.length > 0)) return null;
  return (
    <p className="muted" style={{ margin: 0 }}>
      Add departments and designations in{' '}
      <Link href="/admin/configuration" style={{ color: 'var(--brand)' }}>
        Configuration
      </Link>{' '}
      before assigning them here.
    </p>
  );
}
