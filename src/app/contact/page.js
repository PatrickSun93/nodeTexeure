'use client';

import { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('');
    
    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitStatus('success');
      setFormData({ fullName: '', email: '', subject: '', message: '' });
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSubmitStatus('');
      }, 5000);
    }, 1000);
  };

  return (
    <div className="noirae-page">
      <Header />
      
      <main className="noirae-contact-main">
        <div className="aesop-container">
          {/* Header Section */}
          <div className="noirae-contact-header">
            <h1 className="noirae-contact-title">Get in Touch</h1>
            <p className="noirae-contact-subtitle">
              We would love to hear from you. For inquiries, support, or feedback, please use the form below or reach out via our other channels.
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="noirae-contact-grid">
            {/* Left Column - Send a Message */}
            <div className="noirae-contact-form-section">
              <h2 className="noirae-contact-section-title">Send a Message</h2>
              
              {submitStatus === 'success' && (
                <div className="noirae-contact-success" role="alert">
                  Thank you for your message! We&apos;ll get back to you within 24 hours.
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="noirae-contact-form">
                <div className="noirae-contact-form-group">
                  <label htmlFor="fullName" className="noirae-contact-label">
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="noirae-contact-input"
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="noirae-contact-form-group">
                  <label htmlFor="email" className="noirae-contact-label">
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="noirae-contact-input"
                    placeholder="Enter your email address"
                  />
                </div>

                <div className="noirae-contact-form-group">
                  <label htmlFor="subject" className="noirae-contact-label">
                    Subject
                  </label>
                  <input
                    id="subject"
                    name="subject"
                    type="text"
                    required
                    value={formData.subject}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="noirae-contact-input"
                    placeholder="How can we help?"
                  />
                </div>

                <div className="noirae-contact-form-group">
                  <label htmlFor="message" className="noirae-contact-label">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    value={formData.message}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    rows={6}
                    className="noirae-contact-textarea"
                    placeholder="Write your message here..."
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="noirae-contact-button"
                >
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>

            {/* Right Column - Other Ways to Connect */}
            <div className="noirae-contact-info-section">
              <h2 className="noirae-contact-section-title">Other Ways to Connect</h2>
              
              <div className="noirae-contact-info-cards">
                {/* Email Us */}
                <div className="noirae-contact-info-card">
                  <div className="noirae-contact-info-icon">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="noirae-contact-info-content">
                    <h3 className="noirae-contact-info-title">Email Us</h3>
                    <p className="noirae-contact-info-text">
                      For general inquiries, support, or feedback.
                    </p>
                    <a href="mailto:support@noirae.com" className="noirae-contact-info-link">
                      support@noirae.com
                    </a>
                  </div>
                </div>

                {/* Call Us */}
                <div className="noirae-contact-info-card">
                  <div className="noirae-contact-info-icon">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="noirae-contact-info-content">
                    <h3 className="noirae-contact-info-title">Call Us</h3>
                    <p className="noirae-contact-info-text">
                      Our team is available to help during business hours.
                    </p>
                    <a href="tel:+15551234567" className="noirae-contact-info-link">
                      +1 (555) 123-4567
                    </a>
                    <p className="noirae-contact-info-hours">
                      Mon-Fri, 9am - 5pm EST
                    </p>
                  </div>
                </div>

                {/* Visit Our Showroom */}
                <div className="noirae-contact-info-card">
                  <div className="noirae-contact-info-icon">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="noirae-contact-info-content">
                    <h3 className="noirae-contact-info-title">Visit Our Showroom</h3>
                    <p className="noirae-contact-info-text">
                      Experience the luxury of Noirae products in person.
                    </p>
                    <p className="noirae-contact-info-address">
                      123 Silk Avenue, Cashmere City, 10001
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}