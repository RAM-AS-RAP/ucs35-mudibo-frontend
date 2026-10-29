import { cn } from '@/lib/utils';

/**
 * A numbered step heading (New listing form, Forecast): the number in a green circle, the
 * heading and one line of help. The number is decorative; the heading carries the meaning.
 * @param {{
 *   step: number,
 *   id: string,
 *   title: string,
 *   text?: string,
 *   as?: 'h2' | 'h3',
 *   className?: string,
 * }} props
 */
export function StepHeading({ step, id, title, text, as: Heading = 'h2', className }) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary"
      >
        {step}
      </span>
      <div className="flex flex-col gap-0.5">
        <Heading id={id} className="text-lg font-semibold text-text">
          {title}
        </Heading>
        {text && <p className="text-sm text-text-secondary">{text}</p>}
      </div>
    </div>
  );
}
