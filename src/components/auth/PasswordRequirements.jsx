import { Check, Circle } from 'lucide-react';
import { MESSAGES } from '@/lib/messages';
import { passwordProblems, passwordRequirements } from '@/lib/validation';
import { cn } from '@/lib/utils';

/**
 * The password checklist: each requirement with an icon and a word ("Done" or "Not yet"),
 * so the state never depends on colour alone. Not a live region (it changes on every key).
 * @param {{
 *   id: string,
 *   password: string,
 *   context: Parameters<typeof passwordProblems>[1],
 * }} props
 */
export function PasswordRequirements({ id, password, context = {} }) {
  const requirements = passwordRequirements({
    role: context?.role,
    characterClasses: context?.characterClasses,
  });
  const unmet = new Set(passwordProblems(password ?? '', context).map((p) => p.id));
  const P = MESSAGES.password;

  return (
    <div id={id} className="rounded-md bg-neutral-bg px-3 py-2 text-sm">
      <p className="font-medium text-neutral-text">{P.heading}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {requirements.map((req) => {
          const met = Boolean(password) && !unmet.has(req.id);
          const Icon = met ? Check : Circle;
          return (
            <li
              key={req.id}
              className={cn(
                'flex items-start gap-2',
                met ? 'text-positive-text' : 'text-neutral-text',
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn('mt-0.5 size-4 shrink-0', met && 'text-positive')}
              />
              <span>
                {req.label}
                <span className="sr-only">: {met ? P.met : P.unmet}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
