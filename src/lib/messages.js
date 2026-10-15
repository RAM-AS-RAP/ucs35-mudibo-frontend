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
