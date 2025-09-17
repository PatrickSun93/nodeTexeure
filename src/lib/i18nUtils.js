import { locales, defaultLocale } from '../i18n';

/**
 * Generate a localized URL
 * @param {string} path - The path without locale
 * @param {string} locale - The target locale
 * @returns {string} - The localized URL
 */
export function getLocalizedUrl(path, locale = defaultLocale) {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // For default locale, we might want to omit the locale prefix
  // But since we're using 'always' prefix, we always include it
  return `/${locale}${normalizedPath}`;
}

/**
 * Extract locale from pathname
 * @param {string} pathname - The current pathname
 * @returns {string} - The extracted locale or default locale
 */
export function getLocaleFromPathname(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  if (locales.includes(firstSegment)) {
    return firstSegment;
  }
  
  return defaultLocale;
}

/**
 * Remove locale from pathname
 * @param {string} pathname - The current pathname
 * @returns {string} - The pathname without locale
 */
export function removeLocaleFromPathname(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  if (locales.includes(firstSegment)) {
    return '/' + segments.slice(1).join('/');
  }
  
  return pathname;
}

/**
 * Get alternate language URLs for SEO
 * @param {string} pathname - The current pathname without locale
 * @returns {Array} - Array of alternate URLs
 */
export function getAlternateUrls(pathname) {
  return locales.map(locale => ({
    locale,
    url: getLocalizedUrl(pathname, locale)
  }));
}

/**
 * Format currency based on locale
 * @param {number} amount - The amount to format
 * @param {string} currency - The currency code (USD, CNY, etc.)
 * @param {string} locale - The locale for formatting
 * @returns {string} - The formatted currency string
 */
export function formatCurrency(amount, currency = 'USD', locale = 'en') {
  const localeMap = {
    'en': 'en-US',
    'zh': 'zh-CN'
  };
  
  const formatLocale = localeMap[locale] || locale;
  
  return new Intl.NumberFormat(formatLocale, {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * Format date based on locale
 * @param {Date|string} date - The date to format
 * @param {string} locale - The locale for formatting
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} - The formatted date string
 */
export function formatDate(date, locale = 'en', options = {}) {
  const localeMap = {
    'en': 'en-US',
    'zh': 'zh-CN'
  };
  
  const formatLocale = localeMap[locale] || locale;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  
  return new Intl.DateTimeFormat(formatLocale, { ...defaultOptions, ...options }).format(dateObj);
}

/**
 * Get direction for locale (for RTL support in the future)
 * @param {string} locale - The locale
 * @returns {string} - 'ltr' or 'rtl'
 */
export function getDirection(locale) {
  // Currently all supported locales are LTR
  // Add RTL locales here when needed
  const rtlLocales = [];
  
  return rtlLocales.includes(locale) ? 'rtl' : 'ltr';
}

/**
 * Get language name in its native script
 * @param {string} locale - The locale code
 * @returns {string} - The language name
 */
export function getLanguageName(locale) {
  const languageNames = {
    'en': 'English',
    'zh': '中文'
  };
  
  return languageNames[locale] || locale;
}

/**
 * Validate if a locale is supported
 * @param {string} locale - The locale to validate
 * @returns {boolean} - Whether the locale is supported
 */
export function isValidLocale(locale) {
  return locales.includes(locale);
}