import { Toaster as Sonner } from 'sonner';

/** Toast container. Light theme only; colours come from the tokens. */
function Toaster(props) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-center"
      style={
        /** @type {import('react').CSSProperties} */ ({
          '--normal-bg': 'var(--card)',
          '--normal-text': 'var(--text)',
          '--normal-border': 'var(--border)',
        })
      }
      {...props}
    />
  );
}

export { Toaster };
