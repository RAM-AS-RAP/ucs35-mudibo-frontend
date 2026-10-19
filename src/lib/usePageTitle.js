import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

export const APP_NAME = 'AgriSence';

/**
 * Set document.title to "<screen> - AgriSence" and, on a route change, move focus to the
 * screen's main heading so screen reader users hear where they are. The first page load
 * keeps the browser's default focus. A change of the query string only (a screen keeping its
 * selections in the URL) is not a route change and leaves focus on the control in use.
 * @param {string} title
 * @returns {import('react').RefObject<HTMLHeadingElement | null>}  attach to the h1 (tabIndex -1)
 */
export function usePageTitle(title) {
  const headingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const { key, pathname } = useLocation();
  // Where this screen was mounted: "default" is the key of the first history entry.
  const [mounted] = useState(() => ({ initialLoad: key === 'default', pathname }));

  useEffect(() => {
    document.title = `${title} - ${APP_NAME}`;
  }, [title]);

  useEffect(() => {
    if (mounted.initialLoad && pathname === mounted.pathname) return;
    headingRef.current?.focus();
  }, [pathname, mounted]);

  return headingRef;
}
