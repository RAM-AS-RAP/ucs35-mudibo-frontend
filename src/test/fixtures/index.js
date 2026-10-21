// Fixtures shared by MSW handlers and tests. Each one is validated against the
// matching response schema in docs/backend/openapi.json (src/test/contract.test.js).
import health from './health.json';
import dbHealth from './dbHealth.json';
import tokenResponse from './tokenResponse.json';
import userMe from './userMe.json';
import adminMe from './adminMe.json';
import registeredUser from './registeredUser.json';
import passwordChanged from './passwordChanged.json';
import codeRequested from './codeRequested.json';
import markets from './markets.json';
import currentPricesMaize from './currentPricesMaize.json';
import currentPricesBeans from './currentPricesBeans.json';
import trendNairobiMaize from './trendNairobiMaize.json';
import trendKisumuMaize from './trendKisumuMaize.json';
import trendNairobiBeans from './trendNairobiBeans.json';
import trendKisumuBeans from './trendKisumuBeans.json';
import forecastOneMonth from './forecastOneMonth.json';
import forecastTwoMonth from './forecastTwoMonth.json';
import myListingsPage from './myListingsPage.json';
import listingCreated from './listingCreated.json';
import farmerOrdersPage from './farmerOrdersPage.json';
import publicListingsPage from './publicListingsPage.json';
import listingDetail from './listingDetail.json';
import orderPending from './orderPending.json';
import paymentStarted from './paymentStarted.json';
import orderCancelled from './orderCancelled.json';
import buyerOrdersPage from './buyerOrdersPage.json';
import buyerMarkets from './buyerMarkets.json';

export const fixtures = {
  health,
  dbHealth,
  tokenResponse,
  userMe,
  adminMe,
  registeredUser,
  passwordChanged,
  codeRequested,
  markets,
  currentPricesMaize,
  currentPricesBeans,
  trendNairobiMaize,
  trendKisumuMaize,
  trendNairobiBeans,
  trendKisumuBeans,
  forecastOneMonth,
  forecastTwoMonth,
  myListingsPage,
  listingCreated,
  farmerOrdersPage,
  publicListingsPage,
  listingDetail,
  orderPending,
  paymentStarted,
  orderCancelled,
  buyerOrdersPage,
  buyerMarkets,
};

/** Fixture name to the OpenAPI response it must match. */
export const FIXTURE_CONTRACT = {
  health: { path: '/api/v1/health', method: 'get', status: '200' },
  dbHealth: { path: '/api/v1/health/db', method: 'get', status: '200' },
  tokenResponse: { path: '/api/v1/auth/login', method: 'post', status: '200' },
  userMe: { path: '/api/v1/auth/me', method: 'get', status: '200' },
  adminMe: { path: '/api/v1/auth/accept-invite', method: 'post', status: '201' },
  registeredUser: { path: '/api/v1/auth/register/farmer', method: 'post', status: '201' },
  passwordChanged: { path: '/api/v1/auth/change-password', method: 'post', status: '200' },
  codeRequested: { path: '/api/v1/auth/password-reset/request', method: 'post', status: '202' },
  markets: { path: '/api/v1/markets', method: 'get', status: '200' },
  currentPricesMaize: { path: '/api/v1/prices/current', method: 'get', status: '200' },
  currentPricesBeans: { path: '/api/v1/prices/current', method: 'get', status: '200' },
  trendNairobiMaize: { path: '/api/v1/prices/trends', method: 'get', status: '200' },
  trendKisumuMaize: { path: '/api/v1/prices/trends', method: 'get', status: '200' },
  trendNairobiBeans: { path: '/api/v1/prices/trends', method: 'get', status: '200' },
  trendKisumuBeans: { path: '/api/v1/prices/trends', method: 'get', status: '200' },
  // The 200 schema of GET /forecasts is empty in openapi.json; shap_values is validated by the
  // Zod schema in src/lib/shapSchema.js (src/lib/shapSchema.test.js).
  forecastOneMonth: { path: '/api/v1/forecasts', method: 'get', status: '200' },
  forecastTwoMonth: { path: '/api/v1/forecasts', method: 'get', status: '200' },
  // ListingOut and FarmerOrderOut name their fields without types in openapi.json, so these
  // checks cover the required fields; the screens read the types documented in the endpoints.
  myListingsPage: { path: '/api/v1/listings/mine', method: 'get', status: '200' },
  listingCreated: { path: '/api/v1/listings', method: 'post', status: '201' },
  farmerOrdersPage: { path: '/api/v1/listings/mine/orders', method: 'get', status: '200' },
  // Buyer (F3). PublicListingOut, OrderOut and PaymentStartOut also name their fields without
  // types; OrderListingSummary and OrderPaymentSummary are typed but OrderOut does not $ref
  // them, so src/test/buyer.contract.test.js checks the nested objects against those schemas.
  publicListingsPage: { path: '/api/v1/listings', method: 'get', status: '200' },
  listingDetail: { path: '/api/v1/listings/{listing_id}', method: 'get', status: '200' },
  orderPending: { path: '/api/v1/orders', method: 'post', status: '201' },
  paymentStarted: { path: '/api/v1/orders/{order_id}/pay', method: 'post', status: '202' },
  orderCancelled: { path: '/api/v1/orders/{order_id}/cancel', method: 'post', status: '200' },
  buyerOrdersPage: { path: '/api/v1/orders/mine', method: 'get', status: '200' },
  buyerMarkets: { path: '/api/v1/listings/markets', method: 'get', status: '200' },
};
