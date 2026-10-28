import { LineChart, ShoppingBasket, TrendingUp } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';

/** The brand panel's short list of what the app offers (wide screens only). */
const HIGHLIGHTS = [
  {
    icon: LineChart,
    title: 'Market prices',
    text: 'Monthly maize and bean prices across Kenyan markets.',
  },
  {
    icon: TrendingUp,
    title: 'Price forecasts',
    text: 'One month forecasts, with a plain explanation of how the model reached them.',
  },
  {
    icon: ShoppingBasket,
    title: 'Direct trade',
    text: 'Farmers list their produce; buyers order and pay by M-Pesa.',
  },
];

/**
 * The account screens' layout: the form card with the title (the page's h1) and subtitle.
 * From the `lg` breakpoint a green brand panel sits beside the form; it comes after the form
 * in the reading order, so the heading is read first.
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
      className="flex min-h-dvh bg-canvas outline-none lg:grid lg:h-dvh lg:grid-cols-2 lg:overflow-hidden"
    >
      <div className="flex w-full flex-col items-center px-4 py-8 lg:order-2 lg:overflow-y-auto lg:px-10 lg:py-6">
        <div className="flex w-full max-w-md flex-col gap-6 sm:my-auto lg:max-w-lg lg:gap-4">
          <p className="flex justify-center lg:hidden">
            <BrandMark size="lg" />
          </p>
          <section
            aria-labelledby="auth-title"
            className="flex flex-col gap-5 rounded-2xl border border-border bg-card px-5 py-6 shadow-raised sm:px-7 sm:py-8 lg:gap-4 lg:py-6"
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
        </div>
      </div>

      <div className="bg-brand relative hidden overflow-hidden text-on-primary lg:order-1 lg:flex lg:items-center lg:px-12 xl:px-16">
        <div aria-hidden="true" className="bg-dot-grid pointer-events-none absolute inset-0" />
        <div className="relative flex w-full max-w-md flex-col gap-10">
          <BrandMark size="lg" inverse />
          <p className="text-4xl leading-[1.1] font-extrabold tracking-tight xl:text-5xl">
            Know the market before you sell.
          </p>
          <ul className="flex flex-col gap-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card/15 ring-1 ring-card/20">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{title}</span>
                  <span className="text-on-primary-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
