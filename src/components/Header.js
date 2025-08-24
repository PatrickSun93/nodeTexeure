'use client'

import Link from 'next/link';

export default function Header() {
  return (
    <header style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/">Home</Link>
        <Link href="/shop">Shop</Link>
        <Link href="/cart">Cart</Link>
        <Link href="/profile">Profile</Link>
      </nav>
    </header>
  );
}