'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-white border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-amber-600 rounded"></div>
              <span className="text-xl font-bold text-gray-900">Furniro</span>
            </div>
            <p className="text-gray-600 mb-4">
              400 University Drive Suite 200 Coral Gables,<br />
              FL 33134 USA
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Links</h4>
            <ul className="space-y-2">
              <li><Link href="/" className="text-gray-600 hover:text-amber-600">Home</Link></li>
              <li><Link href="/shop" className="text-gray-600 hover:text-amber-600">Shop</Link></li>
              <li><Link href="/about" className="text-gray-600 hover:text-amber-600">About</Link></li>
              <li><Link href="/contact" className="text-gray-600 hover:text-amber-600">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Help</h4>
            <ul className="space-y-2">
              <li><Link href="/payment-options" className="text-gray-600 hover:text-amber-600">Payment Options</Link></li>
              <li><Link href="/returns" className="text-gray-600 hover:text-amber-600">Returns</Link></li>
              <li><Link href="/privacy-policies" className="text-gray-600 hover:text-amber-600">Privacy Policies</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Newsletter</h4>
            <div className="flex">
              <input 
                type="email" 
                placeholder="Enter Your Email Address" 
                className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button className="bg-amber-600 text-white px-4 py-2 rounded-r-lg hover:bg-amber-700 transition-colors">
                Subscribe
              </button>
            </div>
          </div>
        </div>
        <div className="border-t mt-8 pt-8 text-center text-gray-600">
          <p>&copy; 2024 Furniro. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}