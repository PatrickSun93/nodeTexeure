import Providers from '../components/Providers';
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import "../styles/design-tokens.css";
import "../styles/aesop-design-system.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: 'swap',
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

// Static fallback metadata; actual title will be adjusted client-side on Home via settings
export const metadata = {
  title: "Noiraé shop",
  description: "Noiraé shop",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${cormorantGaramond.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
