/**
 * User facing text of the authentication screens, in one place so a translation can be
 * added later. Error codes from the backend keep their messages in src/api/errors.js.
 */

/** @param {number} seconds */
const secondsText = (seconds) => `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;

export const MESSAGES = Object.freeze({
  // Flash messages shown once on the login screen.
  flash: {
    expired: 'Your session expired. Please sign in again.',
    passwordChanged: 'Password changed. Please sign in again.',
    unauthorized: 'Please sign in to continue.',
    accountCreated: 'Account created. Please sign in.',
    passwordUpdated: 'Password updated. Please sign in.',
  },

  // Shared form messages.
  form: {
    summaryTitle: 'Please fix the following:',
    serverSummaryTitle: 'Something went wrong',
    offline: 'You are offline. Connect to the internet to continue.',
    network: "Can't reach AgriSence. Check your internet connection and try again.",
    /** @param {number} seconds */
    tooManyAttempts: (seconds) => `Too many attempts. Try again in ${secondsText(seconds)}.`,
    /** @param {number} seconds */
    tryAgainIn: (seconds) => `Try again in ${seconds} s`,
    /** @param {number} seconds */
    countdownStart: (seconds) => `Wait ${secondsText(seconds)} before trying again.`,
    countdownDone: 'You can try again now.',
    reference: (/** @type {string} */ id) => `Reference: ${id}`,
  },

  // Field validation.
  field: {
    identifierRequired: 'Enter your phone number or email.',
    identifierShort: 'Enter at least 3 characters.',
    passwordRequired: 'Enter your password.',
    currentPasswordRequired: 'Enter your current password.',
    nameRequired: 'Enter your full name.',
    nameShort: 'Your name needs at least 2 characters.',
    nameLong: 'Your name can have at most 100 characters.',
    phoneRequired: 'Enter your phone number.',
    phoneInvalid: 'Enter a Kenyan mobile number, for example 0712 345 678.',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter a valid email address, for example name@example.com.',
    codeRequired: 'Enter the code from the email.',
    codeInvalid: 'The code has 8 letters and numbers, for example ABCD-2345.',
    confirmRequired: 'Enter the password again.',
    confirmMismatch: 'The passwords do not match.',
    passwordWeak: 'The password does not meet the requirements below.',
    sameAsCurrent: 'The new password must be different from your current password.',
    roleRequired: 'Choose whether you are a farmer or a buyer.',
    wrongCurrent: 'Your current password is incorrect.',
  },

  // Password requirements (the checklist and its problems).
  password: {
    heading: 'Your password needs:',
    /** @param {number} min */
    length: (min) => `${min} to 128 characters`,
    upper: 'An upper case letter (A to Z)',
    lower: 'A lower case letter (a to z)',
    digit: 'A number (0 to 9)',
    symbol: 'A symbol, for example ! ? # or @',
    personal: 'Not your name, phone number or email',
    met: 'Done',
    unmet: 'Not yet',
  },

  login: {
    title: 'Sign in',
    subtitle: 'Use the phone number or email of your AgriSence account.',
    identifierLabel: 'Phone number or email',
    passwordLabel: 'Password',
    submit: 'Sign in',
    pending: 'Signing in…',
    invalid: 'Incorrect phone number, email or password.',
    createAccount: 'Create an account',
    forgotPassword: 'Forgot your password?',
  },

  register: {
    title: 'Create an account',
    subtitle: 'Farmers sell produce and see price forecasts. Buyers order produce.',
    roleLegend: 'Account type',
    farmer: 'I am a farmer',
    farmerHint: 'Check market prices and forecasts, and sell your produce.',
    buyer: 'I am a buyer',
    buyerHint: 'Browse produce from farmers and pay with M-Pesa.',
    nameLabel: 'Full name',
    phoneLabel: 'Phone number',
    phoneHint: 'For example 0712 345 678, 0112 345 678 or +254 712 345 678.',
    emailLabel: 'Email (optional)',
    emailHint: 'Needed if you want to reset your password later.',
    passwordLabel: 'Password',
    confirmLabel: 'Confirm password',
    submit: 'Create account',
    pending: 'Creating your account…',
    info: 'AgriSence is a research prototype. Payments run in the M-Pesa test environment (sandbox) and no real money moves.',
    exists: 'An account with these details already exists.',
    signIn: 'Sign in',
    resetPassword: 'Reset your password',
    haveAccount: 'Already have an account?',
  },

  forgot: {
    title: 'Forgot your password?',
    subtitle: 'Enter the email address of your account and we will send you a code.',
    emailLabel: 'Email',
    help: 'Accounts without an email address cannot reset a forgotten password.',
    submit: 'Send code',
    pending: 'Sending…',
    sent: 'If an account with that email exists, we have sent a code. It is valid for 15 minutes.',
    continue: 'Enter the code',
    backToLogin: 'Back to sign in',
  },

  reset: {
    title: 'Reset your password',
    subtitle: 'Enter the code from the email and choose a new password.',
    emailLabel: 'Email',
    codeLabel: 'Code',
    codeHint: '8 letters and numbers, for example ABCD-2345. Valid for 15 minutes.',
    passwordLabel: 'New password',
    confirmLabel: 'Confirm new password',
    submit: 'Set new password',
    pending: 'Saving…',
    invalidCode: 'That code is incorrect or has expired.',
    resend: 'Send me a new code',
    resendSent:
      'If an account with that email exists, we have sent a new code. It is valid for 15 minutes.',
    backToLogin: 'Back to sign in',
  },

  invite: {
    title: 'Accept your invitation',
    subtitle: 'Enter the code from your invitation email and choose a password.',
    emailLabel: 'Email',
    codeLabel: 'Invitation code',
    codeHint: '8 letters and numbers, for example ABCD-2345.',
    passwordLabel: 'Password',
    passwordHint: 'Administrator passwords need at least 12 characters.',
    confirmLabel: 'Confirm password',
    submit: 'Create administrator account',
    pending: 'Creating your account…',
    invalidCode: 'That code is incorrect or has expired.',
    resend: 'Request a new code',
    resendSent: 'If an invitation for that email is open, we have sent a new code.',
    lockout:
      'Too many attempts, or an invitation that expired? Ask the administrator who invited you to send a new one.',
    backToLogin: 'Back to sign in',
  },

  change: {
    forcedTitle: 'Set a new password',
    forcedText: 'For your security, you must set a new password before continuing.',
    voluntaryTitle: 'Change password',
    voluntaryText: 'After the change you will sign in again with the new password.',
    currentLabel: 'Current password',
    newLabel: 'New password',
    confirmLabel: 'Confirm new password',
    submit: 'Change password',
    pending: 'Saving…',
    cancel: 'Cancel',
    signOut: 'Sign out',
  },

  signedIn: {
    /** @param {string} name */
    text: (name) => `You are signed in as ${name}. Sign out to continue.`,
    someone: 'another account',
    signOut: 'Sign out',
  },

  account: {
    menu: 'Account menu',
    superAdmin: 'Super admin',
    changePassword: 'Change password',
    signOut: 'Sign out',
    /** @param {string} name */
    welcome: (name) => `Welcome, ${name}`,
    welcomeGeneric: 'Welcome',
  },

  layout: {
    footer:
      'AgriSence is a research prototype. Payments run in a test environment and no real money moves.',
    checkingSession: 'Checking your session…',
  },
});

/*
 * Farmer price, trend and forecast screens (F2a). These screens never show a calendar month,
 * a year, a date or an "updated" time: time is relative to the latest published price.
 * Wording rules (docs/forecast-display.md): describe how the model reached a forecast, never a
 * cause of real price movements; "the model expects", never "will"; no guarantees; plain English.
 */

/** Heading of a price card (one place to change). */
export const LABEL_LATEST_PRICE = 'Latest price';
export const FRESHNESS_PRICES = 'Prices are monthly figures from FEWS NET.';
export const FRESHNESS_FORECAST = 'Forecasts look ahead from the latest published prices.';
export const AXIS_TITLE = 'Months before the latest price';

/** @type {Readonly<Record<string, string>>} */
const CROP_LABELS = Object.freeze({ maize: 'Maize', beans: 'Beans' });

/**
 * "Maize" or "Beans" for a crop value from the API.
 * @param {string} crop
 */
export function cropLabel(crop) {
  return CROP_LABELS[crop] ?? crop.charAt(0).toUpperCase() + crop.slice(1);
}

export const PRICE_TEXT = Object.freeze({
  empty: 'Prices are not available yet. Please check again soon.',
  emptyTitle: 'No prices yet',
  noChange: 'No change data',
  /** @param {string} period  for example "1 month ago" */
  vs: (period) => `vs ${period}`,
  perKg: 'per kg',
  trendTitle: 'Price trend',
  rangeLegend: 'Time range',
  marketsLegend: 'Markets',
  marketsHint: 'At least one market stays selected.',
  seeNumbers: 'See the numbers',
  fewPoints: 'There are not enough prices yet to draw a chart. The numbers are in the table.',
  noPrice: 'No price',
  periodColumn: 'Period',
  loadingPrices: 'Loading prices…',
  loadingTrend: 'Loading the price trend…',
  loadingChart: 'Loading the chart…',
  errorTitle: 'Prices could not be loaded',
  trendErrorTitle: 'The price trend could not be loaded',
});

export const FORECAST_TEXT = Object.freeze({
  uncertainty:
    'Forecasts are estimates and can be wrong. Weather, supply, policy and local conditions can change prices in ways the model cannot see.',
  explanationUnavailable: 'The explanation for this forecast is not available right now.',
  forecastUnusable: 'This forecast cannot be shown right now. Please check again soon.',
  whyTitle: 'Why the model expects this',
  typicalDescription:
    'The change the model starts from for this market and crop, before looking at the recent prices.',
  barsNote:
    'The bars show how the model reached this forecast. They are approximate shares and do not add up exactly. They do not prove why prices move.',
  howToRead: 'How to read this',
  howToReadText: [
    'The typical change is where the model starts for this market and crop.',
    'A Boost pushed the model’s forecast up and a Drag pulled it down.',
    'Longer bars had a bigger effect on the forecast, but the shares are approximate.',
  ],
  seeNumbers: 'See the numbers',
  totalLabel: 'Expected change',
  /** @param {string} market @param {string} crop */
  noForecast: (market, crop) =>
    `A forecast is not available yet for ${market} ${crop}. We forecast only from the latest published prices. Please check again soon.`,
  /** @param {string} market @param {string} crop */
  stale: (market, crop) =>
    `The latest forecast for ${market} ${crop} is out of date because new prices have not been published yet. Please check again soon.`,
  notAvailableShort: 'Not available yet',
  planListing: 'Plan a listing',
  planListingHint: 'You choose the price you ask for.',
  limitations:
    'These forecasts use monthly prices published by FEWS NET. A model trained on past prices can be wrong, especially after sudden events.',
  /** @param {string} amount  "KES 40.00" @param {string} when  "in 1 month" */
  caption: (amount, when) =>
    `Expected ${when}, starting from the latest price of ${amount} per kg.`,
  loading: 'Loading the forecast…',
  errorTitle: 'The forecast could not be loaded',
});

/** Plain descriptions of the explanation groups, by the label the ML pipeline sends. */
const GROUP_DESCRIPTIONS = Object.freeze({
  'Time of year': 'The pattern the model learned for this point in the year from past prices.',
  'Recent price momentum': 'How the price moved over the last few months.',
  'Price compared with its recent average':
    'Whether the latest price is above or below its average over recent months.',
});

/**
 * The description of an explanation group; unknown labels get a general one.
 * @param {string} label
 */
export function groupDescription(label) {
  return Object.prototype.hasOwnProperty.call(GROUP_DESCRIPTIONS, label)
    ? GROUP_DESCRIPTIONS[/** @type {keyof typeof GROUP_DESCRIPTIONS} */ (label)]
    : 'Another pattern the model found in past prices.';
}

/*
 * Farmer listings and orders (F2b). Status words are used with an icon and the word, never by
 * colour alone. Wording is plain English; amounts always come from the server.
 */

/** Listing status words (ListingStatus in openapi.json). */
export const LISTING_STATUS_WORDS = Object.freeze({
  active: 'Active',
  sold_out: 'Sold out',
  removed: 'Removed',
});

/** Order status words on the farmer's orders screen (OrderStatus in openapi.json). */
export const ORDER_STATUS_WORDS = Object.freeze({
  paid: 'Paid (test payment)',
  pending_payment: 'Waiting for payment',
  expired: 'Not paid, expired',
  cancelled: 'Cancelled',
  payment_failed: 'Payment failed',
  needs_reconciliation: 'Under review',
});

/** Payment status words (PaymentStatus in openapi.json), shown with an icon by StatusBadge (F3). */
export const PAYMENT_STATUS_WORDS = Object.freeze({
  initiating: 'Sending request',
  initiated: 'Waiting for your phone',
  completed: 'Payment received',
  failed: 'Payment failed',
  cancelled: 'Payment cancelled',
  timeout: 'Timed out',
});

/*
 * Administrator status words (F4), shown with an icon by StatusBadge. Administrators see the
 * order and payment states in neutral words ("Needs review", "Initiated") rather than the
 * buyer's wording.
 */

/** Order statuses as administrators see them (OrderStatus in openapi.json). */
export const ADMIN_ORDER_STATUS_WORDS = Object.freeze({
  pending_payment: 'Waiting for payment',
  paid: 'Paid (test payment)',
  payment_failed: 'Payment failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  needs_reconciliation: 'Needs review',
});

/** Payment statuses as administrators see them (PaymentStatus in openapi.json). */
export const ADMIN_PAYMENT_STATUS_WORDS = Object.freeze({
  initiating: 'Initiating',
  initiated: 'Initiated, waiting for the phone',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  timeout: 'Timed out',
});

/** Invitation statuses (InviteStatus in openapi.json). */
export const INVITE_STATUS_WORDS = Object.freeze({
  pending: 'Pending',
  used: 'Used',
  expired: 'Expired',
  revoked: 'Revoked',
  locked: 'Locked',
});

/** Account states on the users screen (from `is_disabled`). */
export const USER_STATUS_WORDS = Object.freeze({
  active: 'Active',
  disabled: 'Disabled',
});

/** Messages for the photo preparation errors (ImageError codes in lib/image.js). */
export const IMAGE_ERROR_MESSAGES = Object.freeze({
  unsupported_type: 'Choose a JPEG or PNG photo. Other file types cannot be used.',
  input_too_large: 'That photo is larger than 20 MB. Choose a smaller photo.',
  decode_failed: 'That photo could not be opened. Choose another photo.',
  too_many_pixels: 'That photo is too big to prepare on this phone. Choose a smaller photo.',
  still_too_large: 'That photo could not be made small enough to upload. Choose another photo.',
});

/**
 * The message for a photo preparation error code.
 * @param {unknown} code
 */
export function imageErrorMessage(code) {
  return typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(IMAGE_ERROR_MESSAGES, code)
    ? IMAGE_ERROR_MESSAGES[/** @type {keyof typeof IMAGE_ERROR_MESSAGES} */ (code)]
    : IMAGE_ERROR_MESSAGES.decode_failed;
}

export const PHOTO_TEXT = Object.freeze({
  legend: 'Photo (optional)',
  takePhoto: 'Take a photo',
  chooseGallery: 'Choose from gallery',
  removePhoto: 'Remove photo',
  preparing: 'Preparing photo',
  /** @param {string} size  "240 kB" */
  ready: (size) => `Photo ready, ${size}`,
  removed: 'Photo removed.',
  current: 'Current photo',
  willRemove: 'The current photo will be removed when you save.',
  undoRemove: 'Keep the current photo',
  sizeNote: 'Photos are resized automatically. Location data in photos is removed.',
  previewAlt: 'Preview of the chosen photo',
});

export const LISTING_TEXT = Object.freeze({
  myListingsTitle: 'My listings',
  newListing: 'New listing',
  editTitle: 'Edit listing',
  statusLegend: 'Show',
  /** @param {number} shown @param {number} total */
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  loadMore: 'Load more',
  loadingMore: 'Loading more…',
  loading: 'Loading your listings…',
  errorTitle: 'Your listings could not be loaded',
  emptyTitle: 'You have no listings yet.',
  emptyText: 'Create a listing so buyers can find your produce.',
  /** @param {string} status  "sold out" */
  emptyFilteredTitle: (status) => `No ${status} listings.`,
  createFirst: 'Create your first listing',
  checkForecast: 'Check the forecast first',
  /** @param {string} qty  "120.5" */
  available: (qty) => `${qty} kg available`,
  /** @param {string} price  "KES 42.00" */
  perKg: (price) => `${price} per kg`,
  edit: 'Edit',
  remove: 'Remove',
  viewOrders: 'View orders',
  /** @param {string} crop  "maize" */
  photoAlt: (crop) => `Photo of ${crop} listing`,
  removeTitle: 'Remove this listing?',
  removeText: 'Buyers will no longer see it. Orders that are already paid are not affected.',
  removeConfirm: 'Remove listing',
  removing: 'Removing…',
  cancel: 'Cancel',
  close: 'Close',
  removed: 'Listing removed',
  created: 'Listing created',
  saved: 'Changes saved',
  notFoundRefreshed: 'This listing could not be found. The list has been refreshed.',

  cropLegend: 'Crop',
  marketLabel: 'Market',
  marketPlaceholder: 'Choose a market',
  marketsLoading: 'Loading markets…',
  noMarkets:
    'There are no markets with price data yet, so a listing cannot be created. Please check again soon.',
  noMarketsTitle: 'No markets available',
  quantityLabel: 'Quantity (kg)',
  quantityHint: 'How much you can sell now',
  quantityEditHint:
    'Quantity available now. Orders waiting for payment are already taken out of this number.',
  priceLabel: 'Asking price',
  priceSuffix: 'KES per kg',
  priceHint: 'Enter the price for 1 kg, not for a bag',
  /** @param {string} qty @param {string} total  "KES 4,200.00" */
  estimate: (qty, total) => `If all ${qty} kg sell at this price: ${total}`,
  estimateLabel: 'Estimate',
  /** @param {string} words  "about 60% above" @param {string} market */
  caution: (words, market) =>
    `This is ${words} the latest price in ${market}. Check that the price is for 1 kg.`,
  /** @param {string} words @param {string} market @param {string} latest  "KES 40.00" */
  confirm: (words, market, latest) =>
    `This is ${words} the latest price in ${market} (${latest} per kg). Check that the price is for 1 kg, not for a bag.`,
  confirmCheckbox: 'The price is for 1 kg and is correct',
  submitCreate: 'Create listing',
  submitEdit: 'Save changes',
  saving: 'Saving…',
  preparingPhoto: 'Preparing photo',
  noChanges: 'Change the quantity, the price or the photo to save.',
  uncertainCreate:
    'We could not confirm whether your listing was saved. Check My listings before trying again.',
  uncertainEdit:
    'We could not confirm whether your changes were saved. Check My listings before trying again.',
  goToMyListings: 'Go to My listings',
  summaryTitle: 'The listing was not saved',
  marketUnavailable: 'This market has no price data yet. Choose another market.',

  readOnlyCropMarket: 'To change the crop or market, remove this listing and create a new one.',
  removedNotice: 'This listing was removed and can no longer be changed.',
  removedNoticeTitle: 'Removed listing',
  backToListings: 'Back to My listings',
  zeroTitle: 'Mark as sold out?',
  zeroText: 'Setting the quantity to 0 marks this listing as sold out.',
  zeroConfirm: 'Save as sold out',
  reactivateHint: 'This listing will become active again.',
  findingListing: 'Loading the listing…',

  leaveTitle: 'Leave without saving?',
  leaveText: 'Your changes to this listing will be lost.',
  leaveConfirm: 'Leave',
  stay: 'Stay on this page',
});

export const GUIDANCE_TEXT = Object.freeze({
  title: 'Price guidance',
  chooseMarket: 'Choose a market to see its latest price.',
  noPrice: 'There is no recent price for this market.',
  priceUnavailable: 'The latest price could not be loaded. You can still save the listing.',
  forecastUnavailable: 'No forecast for this market yet.',
  seeForecast: 'See the forecast',
  loading: 'Loading price guidance…',
});

export const ORDER_TEXT = Object.freeze({
  title: 'Orders',
  noteFallback:
    'Payments run in a test environment. A paid order is a test confirmation and no real money moves.',
  delivery:
    'AgriSence does not arrange delivery or share contact details in this prototype. Agree handover directly with the buyer through your own channels.',
  filterLegend: 'Show',
  oneListingChip: 'Showing orders for one listing',
  clearListing: 'Show orders for all listings',
  refresh: 'Refresh',
  loadMore: 'Load more',
  loadingMore: 'Loading more…',
  /** @param {number} shown @param {number} total */
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  /** @param {number} shown @param {number} loaded @param {number} total */
  notPaidShowing: (shown, loaded, total) =>
    `${shown} not paid among the ${loaded} of ${total} orders loaded.`,
  notPaidNote:
    'Not paid groups expired, cancelled and failed orders from the orders loaded so far. Load more to check older orders.',
  emptyTitle: 'No orders yet.',
  emptyText: 'Orders appear here when a buyer starts paying for one of your listings.',
  emptyFilteredTitle: 'No orders with this status.',
  loading: 'Loading orders…',
  errorTitle: 'Orders could not be loaded',
  /** @param {string} qty @param {string} price  "KES 42.00" */
  quantityLine: (qty, price) => `${qty} kg at ${price} per kg`,
  total: 'Total',
  buyer: 'Buyer',
  ordered: 'Ordered',
  paidAt: 'Payment completed',
  /** @param {string} receipt */
  paidWithReceipt: (receipt) => `Test payment received, receipt ${receipt}`,
  paidNoReceipt: 'Test payment received',
  waiting: 'The buyer has not completed the payment yet.',
  notPaid: 'No payment was received.',
  review: 'An administrator is checking this payment.',
});

export const DASHBOARD_LISTINGS_TEXT = Object.freeze({
  title: 'My listings and orders',
  activeListings: 'Active listings',
  paidOrders: 'Paid orders',
  countError: 'This number could not be loaded.',
  /** @param {string} label */
  loading: (label) => `Loading ${label.toLowerCase()}…`,
  seeListings: 'See my listings',
  seeOrders: 'See orders',
});
