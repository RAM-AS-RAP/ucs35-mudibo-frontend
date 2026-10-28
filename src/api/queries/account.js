import { useQuery } from '@tanstack/react-query';
import { getMe } from '../endpoints';
import { setProfile } from '@/auth/session';
import { queryKeys } from './keys';
import { accountQueryPolicy } from './policy';

/**
 * GET /auth/me for the account screens (Sign-in methods, Set a password). The profile also
 * refreshes the session (password_set, google_linked, name). Refetched on focus, never polled.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: async () => {
      const me = await getMe();
      setProfile(me);
      return me;
    },
    ...accountQueryPolicy,
  });
}
