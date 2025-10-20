'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="aesop-bg-white aesop-border-t">
      <div className="aesop-container aesop-py-12">
        {/* First Row - Logo and Description */}
        <div className="aesop-text-center aesop-mb-8">
          <div className="aesop-flex aesop-items-center aesop-justify-center aesop-space-x-2 aesop-mb-4">
            <div className="aesop-w-8 aesop-h-8 aesop-bg-primary aesop-rounded"></div>
            <span className="aesop-heading-2">Noiraé</span>
          </div>
          <p className="aesop-text-muted">
            Premium bed textures crafted for the ultimate sleep experience.
          </p>
        </div>

        {/* Second Row - Four columns in one row (responsive) */}
        <div className="aesop-grid aesop-grid-cols-4 aesop-gap-12 aesop-mb-8">
          {/* Shop */}
          <div>
            <h4 className="aesop-heading-4 aesop-mb-4">Shop</h4>
            <ul className="aesop-space-y-2">
              <li><Link href="/shop" className="aesop-text-muted aesop-hover-text-primary">All Products</Link></li>
              <li><Link href="/new-arrive" className="aesop-text-muted aesop-hover-text-primary">New Arrivals</Link></li>
              <li><Link href="/shop?category=sheets" className="aesop-text-muted aesop-hover-text-primary">Sheets</Link></li>
              <li><Link href="/shop?category=pillows" className="aesop-text-muted aesop-hover-text-primary">Pillows</Link></li>
              <li><Link href="/shop?category=blankets" className="aesop-text-muted aesop-hover-text-primary">Blankets</Link></li>
              <li><Link href="/shop?category=mattresses" className="aesop-text-muted aesop-hover-text-primary">Mattresses</Link></li>
              <li><Link href="/shop?category=accessories" className="aesop-text-muted aesop-hover-text-primary">Accessories</Link></li>
            </ul>
          </div>

          {/* Customer Care */}
          <div>
            <h4 className="aesop-heading-4 aesop-mb-4">Customer Care</h4>
            <ul className="aesop-space-y-2">
              <li><Link href="/contact" className="aesop-text-muted aesop-hover-text-primary">Contact Us</Link></li>
              <li><Link href="/about" className="aesop-text-muted aesop-hover-text-primary">About Us</Link></li>
              <li><Link href="/size-guide" className="aesop-text-muted aesop-hover-text-primary">Size Guide</Link></li>
              <li><Link href="/care-instructions" className="aesop-text-muted aesop-hover-text-primary">Care Instructions</Link></li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="aesop-heading-4 aesop-mb-4">Account</h4>
            <ul className="aesop-space-y-2">
              <li><Link href="/profile" className="aesop-text-muted aesop-hover-text-primary">My Account</Link></li>
              <li><Link href="/profile?tab=orders" className="aesop-text-muted aesop-hover-text-primary">Order History</Link></li>
              <li><Link href="/profile?tab=wishlist" className="aesop-text-muted aesop-hover-text-primary">Wishlist</Link></li>
              <li><Link href="/cart" className="aesop-text-muted aesop-hover-text-primary">Cart</Link></li>
            </ul>
          </div>

          {/* Stay Connected */}
          <div>
            <h4 className="aesop-heading-4 aesop-mb-4">Stay Connected</h4>
            <ul className="aesop-space-y-2">
              <li><a href="#newsletter" className="aesop-text-muted aesop-hover-text-primary">Newsletter</a></li>
              <li><a href="#" className="aesop-text-muted aesop-hover-text-primary">Instagram</a></li>
              <li><a href="#" className="aesop-text-muted aesop-hover-text-primary">Pinterest</a></li>
              <li><a href="#" className="aesop-text-muted aesop-hover-text-primary">Facebook</a></li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Third Row - Copyright */}
      <div className="aesop-border-t aesop-pt-8 aesop-text-center aesop-text-muted">
        <div className="aesop-container">
          <p>&copy; 2024 Noiraé. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}