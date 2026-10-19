import { ComingSoon } from '@/components/display/ComingSoon';
import { PageHeader } from '@/components/display/PageHeader';
import { usePageTitle } from '@/lib/usePageTitle';

/**
 * Placeholder for /farmer/listings/new. F2b builds the form and reads the `crop` and `market`
 * query parameters that the forecast screen's "Plan a listing" button sets.
 */
export default function NewListingScreen() {
  const headingRef = usePageTitle('New listing');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New listing" headingRef={headingRef} />
      <ComingSoon feature="New listing" module="F2b (farmer listings)" />
    </div>
  );
}
