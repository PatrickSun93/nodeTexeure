'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// Locale lives in the NEXT_LOCALE cookie (read server-side in src/i18n/request.ts).
// Setting it + router.refresh() re-renders the server tree in the new language.
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

  const choose = (code: string) => {
    if (code === locale) return;
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div className="inline-flex items-center gap-1 text-xs" role="group" aria-label="Language">
      {LOCALES.map(({ code, short, title }, i) => (
        <span key={code} className="inline-flex items-center">
          {i > 0 && <span className="text-gray-300" aria-hidden>/</span>}
          <button
            type="button"
            onClick={() => choose(code)}
            aria-pressed={locale === code}
            disabled={isPending}
            title={title}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              locale === code
                ? 'font-semibold text-blue-700'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {short}
          </button>
        </span>
      ))}
    </div>
  );
}
