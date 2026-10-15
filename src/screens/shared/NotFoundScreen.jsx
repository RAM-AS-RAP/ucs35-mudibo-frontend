import { Link } from 'react-router';
import { MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useSession } from '@/auth/session';
import { homeForRole, PUBLIC_HOME } from '@/auth/roles';

/**
 * Unknown address. Inside a role shell pass `embedded` to render without the page layout.
 * @param {{ embedded?: boolean }} props
 */
export default function NotFoundScreen({ embedded = false }) {
  const session = useSession();
  const home = (session && homeForRole(session.role)) ?? PUBLIC_HOME;
  const content = (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-8 text-center">
      <MapPinOff aria-hidden="true" className="size-10 text-text-secondary" />
      <h1 className="text-2xl font-bold text-text">Page not found</h1>
      <p className="text-text-secondary">This page is not available.</p>
      <Button asChild>
        <Link to={home}>Go to the home page</Link>
      </Button>
    </section>
  );
  return embedded ? content : <PublicLayout>{content}</PublicLayout>;
}
