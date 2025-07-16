'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useBackendHealth } from '../lib';

// Header Component
function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-amber-600 rounded"></div>
            <span className="text-xl font-bold text-gray-900">Furniro</span>
          </div>
          
          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-900 hover:text-amber-600 font-medium">Home</Link>
            <Link href="/shop" className="text-gray-900 hover:text-amber-600 font-medium">Shop</Link>
            <Link href="/about" className="text-gray-900 hover:text-amber-600 font-medium">About</Link>
            <Link href="/contact" className="text-gray-900 hover:text-amber-600 font-medium">Contact</Link>
          </nav>
          
          {/* Icons */}
          <div className="flex items-center space-x-4">
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <button className="p-2 text-gray-600 hover:text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// Hero Section Component
function HeroSection() {
  return (
    <section className="relative bg-gradient-to-r from-amber-50 to-orange-50 py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Premium Bed Textures
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Transform your bedroom with our luxurious collection of high-quality bed textures and linens
          </p>
          <Link href="/shop" className="inline-block bg-amber-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-amber-700 transition-colors">
            Shop Now
          </Link>
        </div>
      </div>
    </section>
  );
}

// Product Card Component
function ProductCard({ name, price, image, isNew = false }) {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        <div className="w-full h-64 bg-gray-200 flex items-center justify-center">
          <span className="text-gray-500">{image || 'Product Image'}</span>
        </div>
        {isNew && (
          <span className="absolute top-4 right-4 bg-green-500 text-white px-2 py-1 rounded text-sm font-medium">
            New
          </span>
        )}
        <button className="absolute top-4 left-4 p-2 bg-white rounded-full shadow-md hover:bg-gray-50">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{name}</h3>
        <p className="text-amber-600 font-bold text-xl">${price}</p>
        <button className="w-full mt-4 bg-amber-600 text-white py-2 rounded-lg hover:bg-amber-700 transition-colors">
          Add to Cart
        </button>
      </div>
    </div>
  );
}

// Featured Products Section
function FeaturedProducts() {
  const products = [
    { name: "Luxury Cotton Sheets", price: "299.99", isNew: true },
    { name: "Silk Pillowcase Set", price: "149.99" },
    { name: "Memory Foam Mattress Topper", price: "199.99" },
    { name: "Bamboo Bed Sheet Set", price: "179.99", isNew: true },
  ];

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Featured Products</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Discover our most popular bed textures and accessories
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.map((product, index) => (
            <ProductCard key={index} {...product} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Features Section
function FeaturesSection() {
  const features = [
    {
      icon: "🏆",
      title: "High Quality",
      description: "crafted from top materials"
    },
    {
      icon: "🛡️",
      title: "Warranty Protection",
      description: "Over 2 years"
    },
    {
      icon: "🚚",
      title: "Free Shipping",
      description: "Order over 150 $"
    },
    {
      icon: "📞",
      title: "24 / 7 Support",
      description: "Dedicated support"
    }
  ];

  return (
    <section className="py-16 bg-amber-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Footer Component
function Footer() {
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
              <li><a href="#" className="text-gray-600 hover:text-amber-600">Payment Options</a></li>
              <li><a href="#" className="text-gray-600 hover:text-amber-600">Returns</a></li>
              <li><a href="#" className="text-gray-600 hover:text-amber-600">Privacy Policies</a></li>
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

export default function Home() {
  const { status: backendStatus, isConnected } = useBackendHealth();


  return (
    <div className="min-h-screen bg-white">
      <Header />
      <HeroSection />
      <FeaturedProducts />
      <FeaturesSection />
      <Footer />
      
      {/* Backend Status - Hidden but functional */}
      <div className="hidden">
        <p>Backend Status: {isConnected ? 'Connected' : 'Disconnected'} - {backendStatus}</p>
      </div>
    </div>
  );
}
