# Multi-language Support Implementation

This document describes the implementation of multi-language support (internationalization/i18n) for the e-commerce platform.

## Overview

The platform now supports:
- **English (en)** - Default language
- **Simplified Chinese (zh)** - Secondary language

## Implementation Details

### 1. Framework Setup

- **Library**: `next-intl` - Modern i18n library for Next.js
- **Routing**: Locale-based URL routing (e.g., `/en/shop`, `/zh/shop`)
- **Middleware**: Automatic locale detection and redirection

### 2. File Structure

```
src/
├── i18n.js                    # Main i18n configuration
├── middleware.js              # Locale routing middleware
├── app/
│   ├── [locale]/             # Locale-based app directory
│   │   ├── layout.js         # Localized layout
│   │   ├── page.js           # Localized home page
│   │   └── shop/
│   │       └── page.js       # Example localized page
│   └── layout.js             # Root layout (minimal)
├── components/
│   ├── LanguageSwitcher.js   # Language switching component
│   ├── Navigation.js         # Localized navigation
│   └── LocalizedHeader.js    # Header with translations
├── hooks/
│   └── useLocaleRouter.js    # Locale-aware routing hook
└── lib/
    └── i18nUtils.js          # i18n utility functions

messages/
├── en.json                   # English translations
└── zh.json                   # Chinese translations
```

### 3. Translation Structure

Translation files are organized by feature areas:

- `common` - Common UI elements (loading, error, success, etc.)
- `navigation` - Navigation menu items
- `categories` - Product categories
- `product` - Product-related terms
- `cart` - Shopping cart functionality
- `checkout` - Checkout process
- `orders` - Order management
- `auth` - Authentication
- `profile` - User profile
- `search` - Search functionality
- `footer` - Footer content
- `errors` - Error messages
- `notifications` - System notifications

### 4. Key Components

#### Language Switcher
- Dropdown component for switching languages
- Shows current language with flag emoji
- Smooth transitions between locales
- Preserves current page path

#### Localized Navigation
- Uses `useTranslations` hook for menu items
- Maintains active state across language switches
- Responsive design for mobile/desktop

#### Utility Functions
- `formatCurrency()` - Locale-aware currency formatting
- `formatDate()` - Locale-aware date formatting
- `getLocalizedUrl()` - Generate locale-specific URLs
- `getAlternateUrls()` - SEO alternate language URLs

### 5. URL Structure

The platform uses locale prefixes for all routes:

```
English:
- /en/              (home)
- /en/shop          (shop page)
- /en/products/123  (product detail)
- /en/cart          (shopping cart)

Chinese:
- /zh/              (home)
- /zh/shop          (shop page)
- /zh/products/123  (product detail)
- /zh/cart          (shopping cart)
```

### 6. Usage Examples

#### Using Translations in Components

```javascript
import { useTranslations } from 'next-intl';

function MyComponent() {
  const t = useTranslations('navigation');
  
  return (
    <nav>
      <Link href="/shop">{t('shop')}</Link>
      <Link href="/cart">{t('cart')}</Link>
    </nav>
  );
}
```

#### Locale-aware Navigation

```javascript
import { useLocaleRouter } from '../hooks/useLocaleRouter';

function MyComponent() {
  const router = useLocaleRouter();
  
  const handleClick = () => {
    router.push('/products/123'); // Automatically adds locale prefix
  };
}
```

#### Currency Formatting

```javascript
import { formatCurrency } from '../lib/i18nUtils';
import { useLocale } from 'next-intl';

function PriceDisplay({ amount }) {
  const locale = useLocale();
  
  return (
    <span>{formatCurrency(amount, 'USD', locale)}</span>
  );
}
```

### 7. SEO Considerations

- Each page includes proper `lang` attribute
- Alternate language URLs for search engines
- Locale-specific meta tags and structured data
- Proper canonical URLs with locale prefixes

### 8. Future Enhancements

#### Additional Languages
To add more languages:

1. Add locale to `src/i18n.js`:
   ```javascript
   export const locales = ['en', 'zh', 'fr']; // Add 'fr' for French
   ```

2. Create translation file:
   ```
   messages/fr.json
   ```

3. Update language switcher flags and names

#### RTL Support
The framework is prepared for RTL languages:
- `getDirection()` utility function
- CSS logical properties ready
- Layout components can be extended

#### Dynamic Content Translation
For database content:
- Store translations in separate tables
- Use locale-aware API endpoints
- Implement content management for translations

### 9. Testing

The implementation includes:
- Build-time validation of translation files
- Component testing with different locales
- URL routing tests for all supported languages

### 10. Performance

Optimizations implemented:
- Translation files are code-split by locale
- Only active locale messages are loaded
- Middleware handles routing efficiently
- Static generation for locale-specific pages

## Migration Notes

Existing pages need to be moved to the `[locale]` directory structure. The middleware handles redirects from old URLs to new locale-prefixed URLs automatically.