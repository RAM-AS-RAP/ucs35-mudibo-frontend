import { BrandMark } from './BrandMark';

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
      <p className="flex justify-center">
        <BrandMark size="lg" />
      </p>
      <div className="flex w-full max-w-md flex-col gap-4">{children}</div>
    </main>
  );
}
