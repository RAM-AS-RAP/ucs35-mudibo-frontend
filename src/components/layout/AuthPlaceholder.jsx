import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PublicLayout } from './PublicLayout';

/**
 * Shared card for the F0 account screen placeholders (not a screen itself).
 * @param {{ title: string, children?: import('react').ReactNode, footer?: import('react').ReactNode }} props
 */
export function AuthPlaceholder({ title, children, footer }) {
  return (
    <PublicLayout>
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">
            {title}
          </CardTitle>
          <CardDescription>This screen is built in module F1 (authentication).</CardDescription>
        </CardHeader>
        {children && <CardContent className="flex flex-col gap-3">{children}</CardContent>}
      </Card>
      {footer}
    </PublicLayout>
  );
}
