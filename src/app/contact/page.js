'use client';

import Link from 'next/link';
import { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';



const Breadcrumb = () => {
  return (
    <div className="aesop-bg-muted aesop-py-8">
      <div className="aesop-container">
        <div className="aesop-text-center">
          <h1 className="aesop-heading-1 aesop-mb-4">Contact Us</h1>
          <nav className="aesop-flex aesop-justify-center aesop-items-center aesop-space-x-2 aesop-text-sm">
            <Link href="/" className="aesop-text-muted aesop-hover-primary">Home</Link>
            <span className="aesop-text-muted">&gt;</span>
            <span className="aesop-text-primary aesop-font-medium">Contact</span>
          </nav>
        </div>
      </div>
    </div>
  );
};

const ContactForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitMessage('Thank you for your message! We\'ll get back to you within 24 hours.');
      setFormData({ name: '', email: '', subject: '', message: '' });
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSubmitMessage('');
      }, 5000);
    }, 1000);
  };

  return (
    <div className="aesop-bg-white aesop-rounded aesop-shadow aesop-p-8">
      <h3 className="aesop-heading-3 aesop-mb-6">Send us a Message</h3>
      
      {submitMessage && (
        <div className="aesop-mb-6 aesop-p-4 aesop-bg-success aesop-rounded">
          <p className="aesop-text-success">{submitMessage}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="aesop-space-y-6">
        <div className="aesop-grid aesop-grid-cols-2 aesop-gap-6">
          <div>
            <label htmlFor="name" className="aesop-label aesop-mb-2">
              Full Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="aesop-input"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label htmlFor="email" className="aesop-label aesop-mb-2">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="aesop-input"
              placeholder="your.email@example.com"
            />
          </div>
        </div>
        
        <div>
          <label htmlFor="subject" className="aesop-label aesop-mb-2">
            Subject *
          </label>
          <select
            id="subject"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            required
            className="aesop-input"
          >
            <option value="">Select a subject</option>
            <option value="general">General Inquiry</option>
            <option value="product">Product Question</option>
            <option value="order">Order Support</option>
            <option value="return">Returns & Exchanges</option>
            <option value="wholesale">Wholesale Inquiry</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="message" className="aesop-label aesop-mb-2">
            Message *
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            required
            rows={6}
            className="aesop-textarea"
            placeholder="Tell us how we can help you..."
          ></textarea>
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className="aesop-btn aesop-btn-primary aesop-w-full"
        >
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </button>
      </form>
    </div>
  );
};

const ContactInfo = () => {
  return (
    <div className="aesop-space-y-8">
      {/* Contact Details */}
      <div className="aesop-bg-white aesop-rounded aesop-shadow aesop-p-8">
        <h3 className="aesop-heading-3 aesop-mb-6">Get in Touch</h3>
        <div className="aesop-space-y-6">
          <div className="aesop-flex aesop-items-start aesop-space-x-4">
            <div className="aesop-icon-container aesop-bg-primary-light aesop-flex-shrink-0">
              <svg className="aesop-icon aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h4 className="aesop-heading-4 aesop-mb-1">Address</h4>
              <p className="aesop-text-muted">
                123 Textile Street<br />
                New York, NY 10001<br />
                United States
              </p>
            </div>
          </div>
          
          <div className="aesop-flex aesop-items-start aesop-space-x-4">
            <div className="aesop-icon-container aesop-bg-primary-light aesop-flex-shrink-0">
              <svg className="aesop-icon aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <h4 className="aesop-heading-4 aesop-mb-1">Phone</h4>
              <p className="aesop-text-muted">
                Main: (555) 123-4567<br />
                Customer Service: (555) 123-4568<br />
                Wholesale: (555) 123-4569
              </p>
            </div>
          </div>
          
          <div className="aesop-flex aesop-items-start aesop-space-x-4">
            <div className="aesop-icon-container aesop-bg-primary-light aesop-flex-shrink-0">
              <svg className="aesop-icon aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h4 className="aesop-heading-4 aesop-mb-1">Email</h4>
              <p className="aesop-text-muted">
                General: info@Noiraé.com<br />
                Support: support@Noiraé.com<br />
                Sales: sales@Noiraé.com
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Business Hours */}
      <div className="aesop-bg-white aesop-rounded aesop-shadow aesop-p-8">
        <h3 className="aesop-heading-3 aesop-mb-6">Business Hours</h3>
        <div className="aesop-space-y-3">
          <div className="aesop-flex aesop-justify-between aesop-items-center aesop-py-2 aesop-border-b aesop-border-muted">
            <span className="aesop-font-medium">Monday - Friday</span>
            <span className="aesop-text-muted">9:00 AM - 6:00 PM EST</span>
          </div>
          <div className="aesop-flex aesop-justify-between aesop-items-center aesop-py-2 aesop-border-b aesop-border-muted">
            <span className="aesop-font-medium">Saturday</span>
            <span className="aesop-text-muted">10:00 AM - 4:00 PM EST</span>
          </div>
          <div className="aesop-flex aesop-justify-between aesop-items-center aesop-py-2">
            <span className="aesop-font-medium">Sunday</span>
            <span className="aesop-text-muted">Closed</span>
          </div>
        </div>
        
        <div className="aesop-mt-6 aesop-p-4 aesop-bg-warning-light aesop-rounded">
          <p className="aesop-text-sm aesop-text-warning">
            <strong>Note:</strong> Customer service is available 24/7 through our online chat system and email support.
          </p>
        </div>
      </div>
      
      {/* FAQ Quick Links */}
      <div className="aesop-bg-white aesop-rounded aesop-shadow aesop-p-8">
        <h3 className="aesop-heading-3 aesop-mb-6">Quick Help</h3>
        <div className="aesop-space-y-4">
          <a href="#" className="aesop-block aesop-p-4 aesop-border aesop-border-muted aesop-rounded aesop-hover-border-primary aesop-hover-bg-primary-light aesop-transition">
            <h4 className="aesop-font-semibold aesop-mb-1">Shipping & Returns</h4>
            <p className="aesop-text-sm aesop-text-muted">Learn about our shipping policies and return process</p>
          </a>
          <a href="#" className="aesop-block aesop-p-4 aesop-border aesop-border-muted aesop-rounded aesop-hover-border-primary aesop-hover-bg-primary-light aesop-transition">
            <h4 className="aesop-font-semibold aesop-mb-1">Size Guide</h4>
            <p className="aesop-text-sm aesop-text-muted">Find the perfect fit for your bedding needs</p>
          </a>
          <a href="#" className="aesop-block aesop-p-4 aesop-border aesop-border-muted aesop-rounded aesop-hover-border-primary aesop-hover-bg-primary-light aesop-transition">
            <h4 className="aesop-font-semibold aesop-mb-1">Care Instructions</h4>
            <p className="aesop-text-sm aesop-text-muted">How to care for your premium bed textures</p>
          </a>
          <a href="#" className="aesop-block aesop-p-4 aesop-border aesop-border-muted aesop-rounded aesop-hover-border-primary aesop-hover-bg-primary-light aesop-transition">
            <h4 className="aesop-font-semibold aesop-mb-1">Wholesale Inquiries</h4>
            <p className="aesop-text-sm aesop-text-muted">Interested in bulk orders? Contact our sales team</p>
          </a>
        </div>
      </div>
    </div>
  );
};

const ContactContent = () => {
  return (
    <div className="aesop-container aesop-py-16">
      <div className="aesop-text-center aesop-mb-12">
        <h2 className="aesop-heading-2 aesop-mb-4">We'd Love to Hear From You</h2>
        <p className="aesop-text-lg aesop-text-muted aesop-max-width-2xl aesop-mx-auto">
          Have questions about our products, need help with an order, or want to share feedback? 
          Our team is here to help you every step of the way.
        </p>
      </div>
      
      <div className="aesop-grid aesop-grid-cols-2 aesop-gap-12">
        <ContactForm />
        <ContactInfo />
      </div>
    </div>
  );
};



export default function ContactPage() {
  return (
    <div className="aesop-page">
      <Header />
      <main>
        <Breadcrumb />
        <ContactContent />
      </main>
      <Footer />
    </div>
  );
}