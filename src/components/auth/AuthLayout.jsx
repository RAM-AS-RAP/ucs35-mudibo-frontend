import { Sprout } from 'lucide-react';
import { MESSAGES } from '@/lib/messages';

/**
 * The account screens' layout: mint canvas, the AgriSence wordmark, a centred white card with
 * the title (the page's h1) and subtitle, and the research prototype note.
 * @param {{
 *   title: string,
 *   subtitle?: import('react').ReactNode,
 *   headingRef?: import('react').Ref<HTMLHeadingElement>,
 *   children?: import('react').ReactNode,
 *   after?: import('react').ReactNode,
 * }} props  after: content under the card (for example the API status)
 */
export function AuthLayout({ title, subtitle, headingRef, children, after }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-8 outline-none sm:justify-center"
    >
      <div className="flex w-full max-w-md flex-col gap-6">
        <p className="flex items-center justify-center gap-2 text-2xl font-bold text-primary">
          <Sprout aria-hidden="true" className="size-8" />
          <span>AgriSence</span>
        </p>
        <section
          aria-labelledby="auth-title"
          className="flex flex-col gap-5 rounded-xl border border-border bg-card px-5 py-6 shadow-sm"
        >
          <div className="flex flex-col gap-1.5">
            <h1
              id="auth-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-bold text-text outline-none"
            >
              {title}
            </h1>
            {subtitle && <p className="text-text-secondary">{subtitle}</p>}
          </div>
          {children}
        </section>
        {after}
        <footer className="text-center text-sm text-text-secondary">
          {MESSAGES.layout.footer}
        </footer>
      </div>
    </main>
  );
}
