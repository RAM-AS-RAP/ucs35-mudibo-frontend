import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONES = {
  rise: { Icon: ArrowUp, className: 'bg-positive-soft', iconClass: 'text-text' },
  fall: { Icon: ArrowDown, className: 'bg-negative-soft', iconClass: 'text-text' },
  flat: { Icon: Minus, className: 'bg-neutral-bg', iconClass: 'text-neutral-text' },
};

/**
 * The recommendation box from recommendationFor(): a tinted box with an icon and the title text
 * (never colour alone), the body, and the separate uncertainty line.
 * @param {{ tone: 'rise' | 'fall' | 'flat', title: string, body: string, note?: string, className?: string }} props
 */
export function Recommendation({ tone, title, body, note, className }) {
  const { Icon, className: toneClass, iconClass } = TONES[tone];
  return (
    <section
      aria-labelledby="recommendation-title"
      data-tone={tone}
      className={cn('flex flex-col gap-2 rounded-xl p-4 text-text', toneClass, className)}
    >
      <h2 id="recommendation-title" className="flex items-start gap-2 text-lg font-semibold">
        <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', iconClass)} />
        <span>{title}</span>
      </h2>
      <p>{body}</p>
      {note && <p className="text-sm">{note}</p>}
    </section>
  );
}
