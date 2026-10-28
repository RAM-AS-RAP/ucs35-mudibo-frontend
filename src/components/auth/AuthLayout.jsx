import { LineChart, ShoppingBasket, Sprout, TrendingUp } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import { MESSAGES } from '@/lib/messages';

/** The brand panel's short list of what the app offers (wide screens only). */
const HIGHLIGHTS = [
  { icon: LineChart, text: 'Monthly maize and bean prices for your markets' },
  { icon: TrendingUp, text: 'One month price forecasts with a plain explanation' },
  {
    icon: ShoppingBasket,
    text: 'Farmers list produce, buyers order and pay by M-Pesa (test mode)',
  },
];

/**
 * The account screens' layout: the form card with the title (the page's h1) and subtitle, and
 * the research prototype note. From the `lg` breakpoint a green brand panel sits beside the
 * form; it comes after the form in the reading order, so the heading is read first.
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
      className="flex min-h-dvh bg-canvas outline-none lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      <div className="flex w-full flex-col items-center px-4 py-8 sm:justify-center lg:order-2 lg:px-8">
        <div className="flex w-full max-w-md flex-col gap-6">
          <p className="flex justify-center lg:hidden">
            <BrandMark size="lg" />
          </p>
          <section
            aria-labelledby="auth-title"
            className="flex flex-col gap-5 rounded-2xl border border-border bg-card px-5 py-6 shadow-raised sm:px-7 sm:py-8"
          >
            <div className="flex flex-col gap-1.5">
              <h1
                id="auth-title"
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl font-extrabold tracking-tight text-text outline-none"
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
      </div>

      <div className="bg-brand relative hidden overflow-hidden text-on-primary lg:order-1 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Sprout
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -bottom-16 size-96 text-on-primary opacity-[0.07]"
        />
        <BrandMark size="lg" inverse />
        <div className="relative flex max-w-md flex-col gap-6">
          <p className="text-4xl leading-tight font-extrabold tracking-tight">
            Know the market before you sell.
          </p>
          <ul className="flex flex-col gap-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-on-primary-muted">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card/15 text-on-primary">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-on-primary-muted">
          Built for smallholder farmers and buyers in Kenya.
        </p>
      </div>
    </main>
  );
}
