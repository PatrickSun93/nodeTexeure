'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useCartCount } from '../../lib'; // added

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { data: session, status } = useSession();
  const { count } = useCartCount(); // added

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
    setIsUserMenuOpen(false);
  };

  const handleSignIn = () => {
    signIn();
    setIsUserMenuOpen(false);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-bold text-amber-600">
              Furniro
            </Link>
          </div>
          
          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-700 hover:text-amber-600 transition-colors">
              Home
            </Link>
            <Link href="/shop" className="text-gray-700 hover:text-amber-600 transition-colors">
              Shop
            </Link>
            <Link href="/about" className="text-amber-600 font-medium">
              About
            </Link>
            <Link href="/contact" className="text-gray-700 hover:text-amber-600 transition-colors">
              Contact
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            {/* User Menu */}
            <div className="relative">
              <button
                className="p-2 text-gray-600 hover:text-amber-600 focus:outline-none"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
              {/* same dropdown content as home */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                  <div className="py-1">
                    {status === 'loading' ? (
                      <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
                    ) : session ? (
                      <>
                        <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                          <div className="font-medium">{session.user?.name || session.user?.email}</div>
                          <div className="text-gray-500 text-xs">{session.user?.email}</div>
                        </div>
                        <Link 
                          href="/profile" 
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          Profile
                        </Link>
                        <Link 
                          href="/cart" 
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          My Cart
                        </Link>
                        <Link 
                          href="/orders" 
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          Orders
                        </Link>
                        <button 
                          onClick={handleSignOut}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Sign Out
                        </button>
                      </>
                    ) : (
                      <>
                        <Link 
                          href="/login" 
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          Sign In
                        </Link>
                        <Link 
                          href="/register" 
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          Sign Up
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600 relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
              </svg>
              <span className="absolute -top-2 -right-2 bg-amber-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{count}</span>
            </button>
          </div>

          <button 
            className="md:hidden p-2 text-gray-600"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <nav className="flex flex-col space-y-2">
              <Link href="/" className="text-gray-700 hover:text-amber-600 py-2">
                Home
              </Link>
              <Link href="/shop" className="text-gray-700 hover:text-amber-600 py-2">
                Shop
              </Link>
              <Link href="/about" className="text-amber-600 font-medium py-2">
                About
              </Link>
              <Link href="/contact" className="text-gray-700 hover:text-amber-600 py-2">
                Contact
              </Link>
              {/* Mobile user menu */}
              {session ? (
                <>
                  <hr className="my-2" />
                  <span className="text-gray-500 text-sm px-2">
                    {session.user?.name || session.user?.email}
                  </span>
                  <Link href="/profile" className="text-gray-700 hover:text-amber-600 py-2">
                    Profile
                  </Link>
                  <Link href="/cart" className="text-gray-700 hover:text-amber-600 py-2">
                    My Cart
                  </Link>
                  <button 
                    onClick={handleSignOut}
                    className="text-left text-gray-700 hover:text-amber-600 py-2"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <hr className="my-2" />
                  <Link href="/login" className="text-gray-700 hover:text-amber-600 py-2">
                    Sign In
                  </Link>
                  <Link href="/register" className="text-gray-700 hover:text-amber-600 py-2">
                    Sign Up
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

const Breadcrumb = () => {
  return (
    <div className="bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">About Us</h1>
          <nav className="flex justify-center items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-600 hover:text-amber-600">Home</Link>
            <span className="text-gray-400">&gt;</span>
            <span className="text-gray-900 font-medium">About</span>
          </nav>
        </div>
      </div>
    </div>
  );
};

const AboutContent = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Crafting Premium Bed Textures Since 2010</h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          At Furniro, we believe that quality sleep begins with exceptional bedding. Our passion for creating 
          the finest bed textures has driven us to source the world's most luxurious materials and craft them 
          into products that transform your bedroom into a sanctuary of comfort.
        </p>
      </div>

      {/* Story Section */}
      <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Our Story</h3>
          <p className="text-gray-600 mb-4">
            Founded in 2010 by textile enthusiasts Sarah and Michael Chen, Furniro began as a small family 
            business with a simple mission: to bring hotel-quality bedding to everyday homes. What started 
            in a small workshop has grown into a trusted brand serving customers worldwide.
          </p>
          <p className="text-gray-600 mb-4">
            Our journey has been guided by an unwavering commitment to quality, sustainability, and customer 
            satisfaction. Every product we create undergoes rigorous testing to ensure it meets our exacting 
            standards for comfort, durability, and style.
          </p>
          <p className="text-gray-600">
            Today, we're proud to offer an extensive collection of premium bed textures, from Egyptian cotton 
            sheets to bamboo fiber pillowcases, each designed to enhance your sleep experience.
          </p>
        </div>
        <div className="bg-gray-200 h-96 rounded-lg flex items-center justify-center">
          <span className="text-gray-500">Our Workshop Image</span>
        </div>
      </div>

      {/* Values Section */}
      <div className="mb-16">
        <h3 className="text-2xl font-bold text-gray-900 text-center mb-12">Our Values</h3>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-xl font-semibold text-gray-900 mb-3">Quality First</h4>
            <p className="text-gray-600">
              We source only the finest materials and employ skilled artisans to ensure every product 
              meets our exceptional quality standards.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h4 className="text-xl font-semibold text-gray-900 mb-3">Sustainability</h4>
            <p className="text-gray-600">
              We're committed to environmental responsibility, using eco-friendly materials and 
              sustainable manufacturing processes wherever possible.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <h4 className="text-xl font-semibold text-gray-900 mb-3">Customer Care</h4>
            <p className="text-gray-600">
              Your satisfaction is our priority. We provide exceptional customer service and stand 
              behind every product with our satisfaction guarantee.
            </p>
          </div>
        </div>
      </div>

      {/* Team Section */}
      <div className="mb-16">
        <h3 className="text-2xl font-bold text-gray-900 text-center mb-12">Meet Our Team</h3>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-gray-500">Sarah Chen</span>
            </div>
            <h4 className="text-xl font-semibold text-gray-900 mb-2">Sarah Chen</h4>
            <p className="text-amber-600 mb-3">Co-Founder & CEO</p>
            <p className="text-gray-600 text-sm">
              With over 15 years in textile design, Sarah leads our product development and ensures 
              every item meets our quality standards.
            </p>
          </div>
          <div className="text-center">
            <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-gray-500">Michael Chen</span>
            </div>
            <h4 className="text-xl font-semibold text-gray-900 mb-2">Michael Chen</h4>
            <p className="text-amber-600 mb-3">Co-Founder & COO</p>
            <p className="text-gray-600 text-sm">
              Michael oversees operations and supply chain, ensuring our products reach customers 
              efficiently while maintaining our sustainability commitments.
            </p>
          </div>
          <div className="text-center">
            <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-gray-500">Emma Rodriguez</span>
            </div>
            <h4 className="text-xl font-semibold text-gray-900 mb-2">Emma Rodriguez</h4>
            <p className="text-amber-600 mb-3">Head of Design</p>
            <p className="text-gray-600 text-sm">
              Emma brings creativity and innovation to our collections, staying ahead of trends while 
              maintaining timeless appeal in our designs.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-amber-50 rounded-lg p-8 text-center">
        <h3 className="text-2xl font-bold text-gray-900 mb-4">Experience the Furniro Difference</h3>
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
          Join thousands of satisfied customers who have transformed their sleep experience with our 
          premium bed textures. Discover the perfect bedding for your home today.
        </p>
        <Link 
          href="/shop" 
          className="inline-block bg-amber-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-amber-700 transition-colors"
        >
          Shop Our Collection
        </Link>
      </div>
    </div>
  );
};

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xl font-bold text-amber-400 mb-4">Furniro</h3>
            <p className="text-gray-300 mb-4">
              Premium bed textures crafted for the ultimate sleep experience.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-amber-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-amber-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/>
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-amber-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.746-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001.012.001z"/>
                </svg>
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link href="/" className="text-gray-300 hover:text-amber-400">Home</Link></li>
              <li><Link href="/shop" className="text-gray-300 hover:text-amber-400">Shop</Link></li>
              <li><Link href="/about" className="text-gray-300 hover:text-amber-400">About</Link></li>
              <li><Link href="/contact" className="text-gray-300 hover:text-amber-400">Contact</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Categories</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-300 hover:text-amber-400">Bed Sheets</a></li>
              <li><a href="#" className="text-gray-300 hover:text-amber-400">Pillowcases</a></li>
              <li><a href="#" className="text-gray-300 hover:text-amber-400">Comforters</a></li>
              <li><a href="#" className="text-gray-300 hover:text-amber-400">Blankets</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Contact Info</h4>
            <div className="space-y-2 text-gray-300">
              <p>123 Textile Street</p>
              <p>New York, NY 10001</p>
              <p>Phone: (555) 123-4567</p>
              <p>Email: info@furniro.com</p>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
          <p>&copy; 2024 Furniro. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <Breadcrumb />
      <AboutContent />
      <Footer />
    </div>
  );
}