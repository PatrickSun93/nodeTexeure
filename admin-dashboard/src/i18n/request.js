import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

// Admin dashboard locale is chosen by the NEXT_LOCALE cookie (set by the admin
// LanguageSwitcher), read server-side here — no URL/route change. Add a language
// by dropping messages/<code>.json and listing it below.
export const SUPPORTED_LOCALES = ['en', 'zh', 'fr', 'es'];
export const DEFAULT_LOCALE = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;
  const locale = SUPPORTED_LOCALES.includes(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
