import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

// Locale is chosen by a cookie (set by the LanguageSwitcher), NOT the URL — so we
// don't have to move every page under app/[locale]/. Add a language by dropping a
// messages/<code>.json file and listing it here.
export const SUPPORTED_LOCALES = ['en', 'zh'];
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
