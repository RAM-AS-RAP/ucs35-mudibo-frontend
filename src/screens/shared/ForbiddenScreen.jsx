import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useAuth } from '@/auth/useAuth';
import { homeForRole, PUBLIC_HOME } from '@/auth/roles';

/** Shown in place of a page the current role may not open (the server enforces this too). */
export default function ForbiddenScreen() {
  const { session, logout } = useAuth();
  const home = (session && homeForRole(session.role)) ?? PUBLIC_HOME;
  return (
    <PublicLayout>
      <section className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-5 py-8 text-center">
        <ShieldAlert aria-hidden="true" className="size-10 text-negative" />
        <h1 className="text-2xl font-bold text-text">No access</h1>
        <p className="text-text-secondary">You don&apos;t have access to this page.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to={home}>Go to my home page</Link>
          </Button>
          {session && (
            <Button type="button" variant="outline" onClick={logout}>
              Sign out
            </Button>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
