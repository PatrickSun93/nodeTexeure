# Frontend Development Guide

**Version:** 1.0  
**Last Updated:** January 24, 2025

---

## 📋 Overview

The NodeTexeure frontend is built with Next.js 15 using the App Router, React 19, and TailwindCSS. It provides a luxury shopping experience with advanced search, filtering, and user account management.

**Port:** 3000  
**Framework:** Next.js 15.3.5  
**UI Library:** React 19  
**Styling:** TailwindCSS 4

---

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit: http://localhost:3000

### Project Structure

```
src/
├── app/                    # Next.js 15 App Router
│   ├── layout.js          # Root layout
│   ├── page.js            # Homepage
│   ├── shop/              # Product listing
│   ├── products/[id]/     # Product detail pages
│   ├── cart/              # Shopping cart
│   ├── checkout/          # Checkout flow (multi-step with Stripe)
│   ├── order/confirmation/[id]/ # Order confirmation
│   ├── orders/            # Order history listing
│   ├── track-order/       # Order tracking page
│   ├── returns/           # Returns management
│   ├── wishlist/          # Product wishlist
│   ├── verify-email/      # Email verification
│   ├── login/             # Authentication
│   ├── register/          # User registration
│   ├── profile/           # User dashboard
│   ├── sitemap.js         # Dynamic sitemap
│   ├── robots.js          # Robots.txt config
│   └── api/               # API route handlers
├── components/            # React components
│   ├── Header.js          # Site header
│   ├── Footer.js          # Site footer
│   ├── SearchBar.js       # Enhanced search ✨
│   ├── CartDrawer.js      # Slide-out cart
│   ├── ProductCard.js     # Product display
│   └── filters/           # Filter components
├── lib/                   # Utilities
│   ├── api.js             # API client
│   └── index.js           # Common utilities
└── styles/               # CSS files
    ├── globals.css        # Global styles
    ├── design-tokens.css  # Design system
    ├── aesop-design-system.css
    ├── searchbar.css      # Search component ✨
    └── header-search.css  # Search integration ✨
```

---

## 🎨 Design System

### Design Tokens

**File:** `src/styles/design-tokens.css`

```css
:root {
  /* Colors */
  --color-primary: #1a1a1a;
  --color-accent: #8b7355;
  --color-background: #ffffff;
  --color-text: #2d2d2d;
  
  /* Typography */
  --font-sans: var(--font-inter);
  --font-serif: var(--font-serif);
  
  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 2rem;
  --spacing-xl: 4rem;
  
  /* Border Radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
}
```

### Typography

**Fonts:**
- Sans-serif: Inter (headings, body)
- Serif: Cormorant Garamond (display text)

**Usage:**
```jsx
<h1 className="font-serif text-4xl">Luxury Bedding</h1>
<p className="font-sans text-base">Premium silk sheets...</p>
```

### Color Palette

```css
/* Primary Colors */
.bg-primary { background: #1a1a1a; }
.text-primary { color: #1a1a1a; }

/* Accent Colors */
.bg-accent { background: #8b7355; }
.text-accent { color: #8b7355; }

/* Neutrals */
.bg-gray-50 { background: #f9fafb; }
.bg-gray-100 { background: #f3f4f6; }
.text-gray-600 { color: #6b7280; }
```

---

## 🧩 Core Components

### Header Component

**File:** `src/components/Header.js`

```jsx
import Header from '../components/Header';

<Header siteName="Noiraé" />
```

**Features:**
- Logo & navigation
- Enhanced search with autocomplete ✨
- Shopping cart with count
- User menu
- Responsive mobile menu

### SearchBar Component ✨ NEW

**File:** `src/components/SearchBar.js`

```jsx
import SearchBar from '../components/SearchBar';

<SearchBar 
  placeholder="Search for luxury bedding..."
  autoFocus={false}
/>
```

**Features:**
- Real-time autocomplete suggestions
- Product suggestions with images
- Category suggestions
- Popular/trending searches
- Keyboard navigation (↑↓ Enter Esc)
- Debounced API calls (300ms)

**Props:**
- `placeholder` (string) - Input placeholder text
- `className` (string) - Additional CSS classes
- `autoFocus` (boolean) - Auto-focus input on mount

### ProductCard Component

**File:** `src/components/ProductCard.js`

```jsx
import { ProductCard } from '../components/ProductCard';

<ProductCard 
  product={product}
  onAddToCart={handleAddToCart}
/>
```

**Product Object:**
```javascript
{
  id: "PROD0000000001",
  name: "Silk Sheet Set",
  price: 450,
  image: "/uploads/products/img.jpg"
}
```

### CartDrawer Component

**File:** `src/components/CartDrawer.js`

```jsx
import CartDrawer from '../components/CartDrawer';

<CartDrawer 
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
/>
```

**Features:**
- Slide-out panel
- Cart items list
- Quantity controls
- Subtotal calculation
- Checkout button

---

## 🔍 Enhanced Search Implementation ✨

### Backend Integration

The search system connects to three API endpoints:

1. **Autocomplete:** `/api/search/autocomplete?q=silk`
2. **Suggestions:** `/api/search/suggestions`
3. **Recent:** `/api/search/recent?ids=PROD1,PROD2`

### Usage Example

```jsx
import SearchBar from '../components/SearchBar';

export default function Page() {
  return (
    <div className="container">
      <SearchBar placeholder="Search products..." />
    </div>
  );
}
```

### Autocomplete Features

**Real-time suggestions:**
- Product names
- Categories
- Popular terms
- Trending products

**Keyboard navigation:**
- `↑` `↓` - Navigate suggestions
- `Enter` - Select suggestion
- `Esc` - Close dropdown

**Performance:**
- Debounced API calls (300ms)
- Minimum 2 characters to trigger
- Automatic caching

### Styling

**CSS Files:**
- `src/styles/searchbar.css` - Main search component styles
- `src/styles/header-search.css` - Header integration styles

**Customization:**
```css
/* Override search bar styles */
.search-bar-input {
  border-radius: 0.5rem;
  padding: 0.75rem 3rem;
}

.search-bar-dropdown {
  border-radius: 0.75rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}
```

---

## 📄 Page Components

### Homepage (`/`)

**File:** `src/app/page.js`

**Sections:**
- Hero banner
- Featured products
- Category highlights
- Newsletter signup

### Shop Page (`/shop`)

**File:** `src/app/shop/page.js`

**Features:**
- Product grid (3 columns)
- Filter sidebar
  - Material
  - Color swatches
  - Price range
  - Size
  - Brand
  - Thread count
- Sorting (newest, price, name)
- Pagination
- Active filters display
- Search integration

**Query Parameters:**
```
/shop?search=silk&material=Silk&min_price=100&max_price=500
```

### Product Detail (`/products/[id]`)

**File:** `src/app/products/[id]/page.js`

**Features:**
- Image gallery
- Product information
- Variant selector
- Add to cart
- Reviews section
- Related products

### Cart Page (`/cart`)

**File:** `src/app/cart/page.js`

**Features:**
- Cart items list
- Quantity controls
- Remove items
- Subtotal calculation
- Proceed to checkout

### Checkout (`/checkout`)

**File:** `src/app/checkout/page.js`

**Steps:**
1. Shipping address
2. Billing address
3. Payment method (Stripe integration)
4. Order review & confirmation

### Order Confirmation (`/order/confirmation/[id]`)

**File:** `src/app/order/confirmation/[id]/page.js`

**Features:**
- Order summary with line items
- Payment status display
- Shipping details
- Print-friendly layout

### Order History (`/orders`)

**File:** `src/app/orders/page.js`

**Features:**
- Order list with status badges
- Order detail expansion
- Reorder functionality

### Order Tracking (`/track-order`)

**File:** `src/app/track-order/page.js`

**Features:**
- Track by order number or tracking number
- Shipping status timeline
- Carrier tracking integration

### User Profile (`/profile`)

**File:** `src/app/profile/page.js`

**Sections:**
- Account details
- Order history
- Saved addresses
- Password change

---

## 🔌 API Integration

### API Client

**File:** `src/lib/api.js`

```javascript
import { apiRequest } from '../lib/api';

// GET request
const products = await apiRequest('/products?limit=20');

// POST request
const order = await apiRequest('/orders/create', {
  method: 'POST',
  body: JSON.stringify(orderData)
});
```

### Response Handling

All API responses follow this format:

```javascript
{
  status: "SUCCESS" | "FAIL",
  message: "...",
  keyValueTable: { ... }
}
```

**Helper Functions:**

```javascript
import { extractResponseData, isSuccessResponse } from '../lib/api';

const response = await apiRequest('/products');

if (isSuccessResponse(response)) {
  const { data } = extractResponseData(response);
  console.log(data.products);
} else {
  console.error(response.message);
}
```

### Example: Fetching Products

```jsx
'use client';
import { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch('http://localhost:6666/api/products');
        const data = await response.json();
        
        if (data.status === 'SUCCESS') {
          setProducts(data.keyValueTable.products);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

---

## 🛒 Cart Management

### Cart Hook

**File:** `src/lib/index.js`

```jsx
import { useCartCount } from '../lib';

export default function Header() {
  const { count, refreshCart } = useCartCount();

  return (
    <button onClick={() => console.log(`Cart has ${count} items`)}>
      Cart ({count})
    </button>
  );
}
```

### Adding to Cart

```jsx
const handleAddToCart = async (product) => {
  try {
    await apiRequest('/cart/add', {
      method: 'POST',
      body: JSON.stringify({
        product_id: product.id,
        variant_id: product.variant_id,
        quantity: 1
      })
    });

    // Trigger cart update event
    window.dispatchEvent(new Event('cart:updated'));
  } catch (error) {
    console.error('Error adding to cart:', error);
  }
};
```

---

## 🎨 Styling Guide

### TailwindCSS Classes

**Common Patterns:**

```jsx
// Container
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

// Card
<div className="bg-white rounded-lg shadow-md p-6">

// Button
<button className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700">

// Grid
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
```

### Custom CSS Classes

**File:** `src/styles/aesop-design-system.css`

```css
/* Header */
.aesop-header { ... }
.aesop-nav-link { ... }

/* Products */
.noirae-shop-product-card { ... }
.noirae-shop-grid { ... }

/* Buttons */
.button { ... }
.button-primary { ... }

/* Forms */
.input { ... }
.select { ... }
```

---

## 🔐 Authentication

### Login Flow

```jsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await fetch('http://localhost:6666/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(credentials)
    });

    const data = await res.json();

    if (data.status === 'SUCCESS') {
      router.push('/profile');
    } else {
      alert(data.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="email"
        value={credentials.email}
        onChange={(e) => setCredentials({...credentials, email: e.target.value})}
      />
      <input 
        type="password"
        value={credentials.password}
        onChange={(e) => setCredentials({...credentials, password: e.target.value})}
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

### Protected Routes

```jsx
'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function ProtectedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') return <div>Loading...</div>;

  return <div>Protected Content</div>;
}
```

---

## 📱 Responsive Design

### Breakpoints

```css
/* Mobile first */
.container {
  padding: 1rem;
}

/* Tablet */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .container {
    padding: 4rem;
  }
}
```

### TailwindCSS Responsive Classes

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {/* 1 column mobile, 2 tablet, 3 desktop */}
</div>

<p className="text-sm md:text-base lg:text-lg">
  {/* Responsive text sizes */}
</p>
```

---

## 🧪 Testing

### Manual Testing

```bash
# Start dev server
npm run dev

# Test pages:
# - http://localhost:3000
# - http://localhost:3000/shop
# - http://localhost:3000/products/PROD0000000001
# - http://localhost:3000/cart
# - http://localhost:3000/login
```

### Browser DevTools

1. Open DevTools (F12)
2. Check Console for errors
3. Network tab for API calls
4. Application tab for cookies/storage

---

## 🚀 Production Build

### Build Commands

```bash
# Create production build
npm run build

# Test production build locally
npm start

# Visit: http://localhost:3000
```

### Optimization

**Next.js automatically:**
- Code splitting
- Image optimization
- Font optimization
- Minification
- Tree shaking

---

## 📝 Best Practices

### Component Structure

```jsx
// 1. Imports
import { useState } from 'react';
import Link from 'next/link';

// 2. Component
export default function MyComponent({ prop1, prop2 }) {
  // 3. State
  const [state, setState] = useState(null);

  // 4. Effects
  useEffect(() => {
    // ...
  }, []);

  // 5. Handlers
  const handleClick = () => {
    // ...
  };

  // 6. Render
  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

### File Naming

- **Components:** PascalCase (Header.js, ProductCard.js)
- **Pages:** lowercase (page.js, layout.js)
- **Utilities:** camelCase (api.js, index.js)
- **Styles:** kebab-case (search-bar.css)

### State Management

```jsx
// Local state (simple)
const [count, setCount] = useState(0);

// Context (global)
import { useCartCount } from '../lib';
const { count } = useCartCount();
```

---

## 🐛 Troubleshooting

### Common Issues

**Port already in use:**
```bash
lsof -i :3000
kill -9 $(lsof -ti:3000)
npm run dev
```

**Cache issues:**
```bash
npm run clean:full
```

**API connection errors:**
- Check backend is running (port 6666)
- Verify CORS settings
- Check `.env` configuration

**Styling not updating:**
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

---

**Last Updated:** April 5, 2026  
**Version:** 1.0
