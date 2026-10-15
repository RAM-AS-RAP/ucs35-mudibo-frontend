import { AlertTriangle } from 'lucide-react';
import { MESSAGES } from '@/lib/messages';

/**
 * @typedef {object} FormProblem
 * @property {string} text
 * @property {string} [fieldId]  links the problem to its input
 */

/**
 * The list of problems after a failed submit, in a role="alert" region. Each problem with a
 * field links to it. The screen moves focus here after a server error (pass a ref).
 * @param {{
 *   problems: FormProblem[],
 *   title?: string,
 *   reference?: string | null,
 *   children?: import('react').ReactNode,
 *   ref?: import('react').Ref<HTMLDivElement>,
 * }} props
 */
export function FormErrorSummary({ problems, title, reference, children, ref }) {
  if (!problems.length) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-labelledby="form-error-summary-title"
      className="flex flex-col gap-2 rounded-lg border border-negative bg-card px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <h2
        id="form-error-summary-title"
        className="flex items-center gap-2 text-base font-semibold text-negative-text"
      >
        <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-negative" />
        <span>{title ?? MESSAGES.form.serverSummaryTitle}</span>
      </h2>
      <ul className="flex flex-col gap-1 text-sm text-text">
        {problems.map((problem) => (
          <li key={`${problem.fieldId ?? ''}${problem.text}`}>
            {problem.fieldId ? (
              <a
                href={`#${problem.fieldId}`}
                className="inline-flex min-h-11 items-center text-negative-text underline underline-offset-2"
                onClick={(event) => {
                  const field = document.getElementById(/** @type {string} */ (problem.fieldId));
                  if (!field) return;
                  event.preventDefault();
                  field.focus();
                }}
              >
                {problem.text}
              </a>
            ) : (
              <span>{problem.text}</span>
            )}
          </li>
        ))}
      </ul>
      {children}
      {reference && (
        <p className="text-sm text-text-secondary">
          {MESSAGES.form.reference('')}
          <span className="font-mono break-all">{reference}</span>
        </p>
      )}
    </div>
  );
}
