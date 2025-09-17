'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';

export function useLocaleRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const push = (href, options = {}) => {
    // If href already includes locale, use as-is
    if (href.startsWith(`/${locale}/`) || href.match(/^\/[a-z]{2}\//)) {
      return router.push(href, options);
    }
    
    // Add current locale to href
    const localizedHref = href.startsWith('/') ? `/${locale}${href}` : `/${locale}/${href}`;
    return router.push(localizedHref, options);
  };

  const replace = (href, options = {}) => {
    // If href already includes locale, use as-is
    if (href.startsWith(`/${locale}/`) || href.match(/^\/[a-z]{2}\//)) {
      return router.replace(href, options);
    }
    
    // Add current locale to href
    const localizedHref = href.startsWith('/') ? `/${locale}${href}` : `/${locale}/${href}`;
    return router.replace(localizedHref, options);
  };

  const switchLocale = (newLocale) => {
    // Remove current locale from pathname and add new locale
    const pathWithoutLocale = pathname.replace(`/${locale}`, '') || '/';
    const newPath = `/${newLocale}${pathWithoutLocale}`;
    return router.push(newPath);
  };

  return {
    push,
    replace,
    switchLocale,
    back: router.back,
    forward: router.forward,
    refresh: router.refresh,
    prefetch: router.prefetch,
    pathname,
    locale
  };
}