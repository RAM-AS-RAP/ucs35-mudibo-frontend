import { Hammer } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';

/**
 * Placeholder for a screen that a later module builds.
 * @param {{ feature: string, module: string }} props  for example feature "Forecast", module "F2 (farmer)"
 */
export function ComingSoon({ feature, module }) {
  return (
    <EmptyState
      icon={Hammer}
      title={`${feature} is coming soon`}
      description={`This screen is built in module ${module}.`}
    />
  );
}
