/**
 * The forecast the farmer asked for on the forecast screen: the market, the crop and whether the
 * explanation is open. Kept in memory (not in the URL or storage) so it survives a visit to
 * another tab, and cleared on sign out or a reload.
 */
import { useSyncExternalStore } from 'react';
import { getSession, subscribe as subscribeSession } from '@/auth/session';

/** @typedef {{ market: string, crop: 'maize' | 'beans', whyOpen: boolean }} ForecastRequest */

/** @type {ForecastRequest | null} */
let request = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

/** @param {ForecastRequest | null} next */
function set(next) {
  request = next;
  emit();
}

/**
 * Remember a request for this market and crop. A new selection starts with the explanation
 * closed; asking again for the same one keeps it as it is.
 * @param {string} market
 * @param {'maize' | 'beans'} crop
 */
export function requestForecast(market, crop) {
  if (request?.market === market && request.crop === crop) return;
  set({ market, crop, whyOpen: false });
}

/**
 * Open or close the explanation of the current request.
 * @param {boolean} whyOpen
 */
export function setWhyOpen(whyOpen) {
  if (request) set({ ...request, whyOpen });
}

/** Forget the request (a new market or crop, or sign out). */
export function clearForecastRequest() {
  if (request) set(null);
}

/** @returns {ForecastRequest | null} */
export function getForecastRequest() {
  return request;
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current request, re-rendering on every change. */
export function useForecastRequest() {
  return useSyncExternalStore(subscribe, getForecastRequest, getForecastRequest);
}

// A request belongs to the signed in farmer: forget it when the session ends.
subscribeSession(() => {
  if (!getSession()) clearForecastRequest();
});
