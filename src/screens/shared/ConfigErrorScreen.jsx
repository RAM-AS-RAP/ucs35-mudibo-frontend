import { Settings } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';

/**
 * Full page configuration error, shown instead of the app when the environment is invalid.
 * @param {{ errors: string[] }} props
 */
export default function ConfigErrorScreen({ errors }) {
  return (
    <PublicLayout>
      <section
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-negative bg-card px-5 py-6"
      >
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          <Settings aria-hidden="true" className="size-6 text-negative" />
          Configuration error
        </h1>
        <p className="text-text-secondary">
          AgriSence cannot start because its configuration is invalid:
        </p>
        <ul className="list-disc pl-5 text-text">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
        <p className="text-sm text-text-secondary">
          Fix the value in your .env file (see .env.example) and restart or rebuild the app.
        </p>
      </section>
    </PublicLayout>
  );
}
