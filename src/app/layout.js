import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import Providers from '../components/Providers';
import { Jost, Cormorant_Garamond, EB_Garamond } from "next/font/google";
import "./globals.css";
import "../styles/design-tokens.css";
import "../styles/aesop-design-system.css";
import "../styles/searchbar.css";
import "../styles/header-search.css";

// "Champagne & Charcoal" typography
const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const ebGaramond = EB_Garamond({
  variable: "--font-editorial",
  subsets: ["latin"],
  style: ['normal', 'italic'],
  display: 'swap',
});

// Static fallback metadata; actual title will be adjusted client-side on Home via settings
export const metadata = {
  title: "Noiraé shop",
  description: "Noiraé shop",
};

// Applies the saved theme before first paint so there's no light->dark flash.
const themeInitScript = `try{var t=localStorage.getItem('noirae-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}`;

export default async function RootLayout({ children }) {
  // Locale + messages come from src/i18n/request.js (cookie-based).
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${jost.variable} ${cormorantGaramond.variable} ${ebGaramond.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
