import { Sprout } from 'lucide-react';

/**
 * Centered single column layout for public and account pages (login, register, errors).
 * @param {{ children?: import('react').ReactNode }} props
 */
export function PublicLayout({ children }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 py-8 outline-none"
    >
      <p className="flex items-center gap-2 text-2xl font-bold text-primary">
        <Sprout aria-hidden="true" className="size-8" />
        <span>AgriSence</span>
      </p>
      <div className="flex w-full max-w-md flex-col gap-4">{children}</div>
    </main>
  );
}
