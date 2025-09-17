'use client';

import Link from 'next/link';
import { FooterSiteLinks } from './InternalLinks';

export default function Footer() {
  return (
    <footer className="aesop-bg-white aesop-border-t">
      <div className="aesop-container aesop-py-12">
        {/* First Row - Logo and Description */}
        <div className="aesop-text-center aesop-mb-8">
          <div className="aesop-flex aesop-items-center aesop-justify-center aesop-space-x-2 aesop-mb-4">
            <span className="aesop-heading-2">Noiraé</span>
          </div>
          <p className="aesop-text-muted">
            Premium bed textures crafted for the ultimate sleep experience.
          </p>
        </div>

        {/* SEO-optimized Footer Links */}
        <FooterSiteLinks className="aesop-mb-8" />
        
        {/* Newsletter and Social */}
        <div className="aesop-text-center aesop-mb-8">
          <h4 className="aesop-heading-4 aesop-mb-4">Stay Connected</h4>
          <p className="aesop-text-muted aesop-mb-4">
            Subscribe to our newsletter for the latest updates on premium bed textures and exclusive offers.
          </p>
          <div className="aesop-flex aesop-justify-center aesop-space-x-4">
            <a href="#" className="aesop-text-muted aesop-hover-text-primary" aria-label="Follow us on Instagram">Instagram</a>
            <a href="#" className="aesop-text-muted aesop-hover-text-primary" aria-label="Follow us on Pinterest">Pinterest</a>
            <a href="#" className="aesop-text-muted aesop-hover-text-primary" aria-label="Follow us on Facebook">Facebook</a>
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