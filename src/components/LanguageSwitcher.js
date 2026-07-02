'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// Locale lives in the NEXT_LOCALE cookie (read server-side in src/i18n/request.js).
// Setting it + router.refresh() re-renders the server tree in the new language,
// with no URL change and no page restructure.
const LOCALES = [
  { code: 'en', short: 'EN', title: 'English' },
  { code: 'zh', short: '中', title: '中文' },
  { code: 'fr', short: 'FR', title: 'Français' },
  { code: 'es', short: 'ES', title: 'Español' },
];

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const choose = (code) => {
    if (code === locale) return;
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div
      className="nt-lang-switch"
      role="group"
      aria-label="Language"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
    >
      {LOCALES.map(({ code, short, title }, i) => (
        <span key={code} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && (
            <span aria-hidden style={{ color: 'var(--noirae-border-dark)', fontSize: 11 }}>/</span>
          )}
          <button
            type="button"
            onClick={() => choose(code)}
            aria-pressed={locale === code}
            disabled={isPending}
            title={title}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: locale === code ? 'default' : 'pointer',
              padding: '2px 5px',
              fontFamily: 'var(--noirae-font-sans)',
              fontSize: 12,
              letterSpacing: '0.06em',
              fontWeight: locale === code ? 600 : 400,
              color: locale === code ? 'var(--noirae-charcoal)' : 'var(--noirae-text-muted)',
              transition: 'color .2s ease',
            }}
          >
            {short}
          </button>
        </span>
      ))}
    </div>
  );
}
