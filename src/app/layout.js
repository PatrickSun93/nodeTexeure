import Providers from '../components/Providers';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';
import PerformanceMonitor from '../components/PerformanceMonitor';
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import "../styles/aesop-design-system.css";
import "../styles/performance.css";
import { generateMetaTags, generateStructuredData, defaultSEO } from '../lib/seo';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: 'swap',
});

// Enhanced SEO metadata
export const metadata = generateMetaTags({
  title: defaultSEO.title,
  description: defaultSEO.description,
  keywords: defaultSEO.keywords,
  url: '/',
  type: 'website'
});

export default function RootLayout({ children }) {
  // Generate structured data for the website
  const websiteStructuredData = generateStructuredData('website');
  const organizationStructuredData = generateStructuredData('organization');

  return (
    <html lang="en">
      <head>
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteStructuredData)
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationStructuredData)
          }}
        />
        
        {/* Additional SEO Meta Tags */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="language" content="English" />
        <meta name="author" content="Noiraé" />
        <meta name="theme-color" content="#000000" />
        
        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Favicon and app icons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body
        className={`${inter.variable} ${playfairDisplay.variable} antialiased`}
      >
        <Providers>
          {children}
          <ServiceWorkerRegistration />
          <PerformanceMonitor />
        </Providers>
      </body>
    </html>
  );
}
