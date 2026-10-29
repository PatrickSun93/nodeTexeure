/**
 * Optional error tracking. Loaded first by server.js (Sentry has to hook modules
 * before express is required). A no-op unless SENTRY_DSN is set, in keeping with
 * the "integrations degrade gracefully" convention.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const dsn = process.env.SENTRY_DSN;
const enabled = Boolean(dsn) && process.env.NODE_ENV !== 'test';

let Sentry = null;
if (enabled) {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
    // Never ship credentials or customer PII with error events.
    sendDefaultPii: false,
  });
  console.log('📈 Sentry error tracking enabled');
}

module.exports = { Sentry };
