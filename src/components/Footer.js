'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="aesop-footer">
      <div className="aesop-container">
        {/* Brand and short description */}
        <div className="aesop-text-center aesop-mb-8">
          <div className="aesop-flex aesop-items-center aesop-justify-center aesop-space-x-2 aesop-mb-4">
            <div className="aesop-w-8 aesop-h-8 aesop-bg-primary aesop-rounded"></div>
            <span className="aesop-heading-2">Noiraé</span>
          </div>
          <p className="aesop-text-muted">
            Premium bed textures crafted for the ultimate sleep experience.
          </p>
        </div>

        {/* Main Footer - 4 columns: Shop, Customer Care, About, Stay Connected */}
        <div className="aesop-footer-content">
          {/* Shop */}
          <div className="aesop-footer-section">
            <h3>Shop</h3>
            <ul>
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
          <div className="aesop-footer-section">
            <h3>Customer Care</h3>
            <ul>
              <li><Link href="/contact" className="aesop-text-muted aesop-hover-text-primary">Contact Us</Link></li>
              <li><Link href="/size-guide" className="aesop-text-muted aesop-hover-text-primary">Size Guide</Link></li>
              <li><Link href="/care-instructions" className="aesop-text-muted aesop-hover-text-primary">Care Instructions</Link></li>
            </ul>
          </div>

          {/* About */}
          <div className="aesop-footer-section">
            <h3>About</h3>
            <ul>
              <li><Link href="/about" className="aesop-text-muted aesop-hover-text-primary">About Us</Link></li>
              <li><Link href="/contact" className="aesop-text-muted aesop-hover-text-primary">Contact Us</Link></li>
            </ul>
          </div>

          {/* Stay Connected */}
          <div className="aesop-footer-section">
            <h3>Stay Connected</h3>
            <ul>
              <li><a href="#newsletter" className="aesop-text-muted aesop-hover-text-primary">Newsletter</a></li>
              <li><a href="#" className="aesop-text-muted aesop-hover-text-primary">Instagram</a></li>
              <li><a href="#" className="aesop-text-muted aesop-hover-text-primary">Pinterest</a></li>
              <li><a href="#" className="aesop-text-muted aesop-hover-text-primary">Facebook</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="aesop-footer-bottom">
        <div className="aesop-container">
          <p>&copy; 2024 Noiraé. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}