import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

export const APP_NAME = 'AgriSence';

/**
 * Set document.title to "<screen> - AgriSence" and, on a route change, move focus to the
 * screen's main heading so screen reader users hear where they are. The first page load
 * keeps the browser's default focus.
 * @param {string} title
 * @returns {import('react').RefObject<HTMLHeadingElement | null>}  attach to the h1 (tabIndex -1)
 */
export function usePageTitle(title) {
  const headingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const { key } = useLocation();

  useEffect(() => {
    document.title = `${title} - ${APP_NAME}`;
  }, [title]);

  useEffect(() => {
    // "default" is the key of the first entry: do not steal focus on the initial load.
    if (key === 'default') return;
    headingRef.current?.focus();
  }, [key]);

  return headingRef;
}
