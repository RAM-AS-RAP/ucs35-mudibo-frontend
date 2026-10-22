/**
 * DEVELOPMENT ONLY role preview. Creates a fake in memory session so the three shells can be
 * viewed without a backend login. The fake session has no token, is never persisted, never
 * produces an Authorization header and never reaches the backend.
 *
 * Loaded only when import.meta.env.DEV (see routes.jsx), so production builds do not contain it.
 * scripts/check-build.mjs fails if the marker below appears in the build output.
 */
import { useNavigate } from 'react-router';
import { clear, startDevFakeSession, useSession } from '@/auth/session';
import { homeForRole } from '@/auth/roles';

export const DEV_SWITCHER_MARKER = 'agrisence-dev-role-switcher';

const OPTIONS = [
  { label: 'Farmer', role: 'farmer' },
  { label: 'Buyer', role: 'buyer' },
  { label: 'Admin', role: 'admin' },
  { label: 'Super admin', role: 'admin', isSuperAdmin: true },
];

export default function DevRoleSwitcher() {
  const navigate = useNavigate();
  const session = useSession();

  /** @param {{ role: string, isSuperAdmin?: boolean }} option */
  function preview(option) {
    startDevFakeSession(option);
    navigate(homeForRole(option.role) ?? '/', { replace: true });
  }

  return (
    <details
      data-marker={DEV_SWITCHER_MARKER}
      className="fixed right-3 bottom-3 z-50 max-w-[16rem] rounded-lg border border-border bg-card text-sm shadow-lg"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-text">
        Dev: role preview
      </summary>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <p className="text-text-secondary">
          Fake session, no backend calls with a token.
          {session?.isDevFake
            ? ` Now: ${session.role}${session.isSuperAdmin ? ' (super)' : ''}.`
            : ''}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className="min-h-11 rounded-md border border-border px-2 hover:bg-canvas"
              onClick={() => preview(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="min-h-11 rounded-md border border-border px-2 hover:bg-canvas"
          onClick={() => {
            clear('dev');
            navigate('/login', { replace: true });
          }}
        >
          End preview
        </button>
      </div>
    </details>
  );
}
