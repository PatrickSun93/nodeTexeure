const axios = require('axios');
const logger = require('../utils/logger');

class CurrencyService {
  constructor() {
    this.exchangeRates = new Map();
    this.lastUpdate = null;
    this.updateInterval = 60 * 60 * 1000; // 1 hour
    this.baseCurrency = 'USD';
    this.supportedCurrencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
    
    // Default exchange rates (fallback)
    this.defaultRates = {
      'USD': 1,
      'CNY': 7.2,
      'EUR': 0.85,
      'GBP': 0.73,
      'JPY': 110,
      'CAD': 1.25,
      'AUD': 1.35
    };
    
    // Initialize with default rates
    this.initializeDefaultRates();
    
    // Start periodic updates
    this.startPeriodicUpdates();
  }

  /**
   * Initialize with default exchange rates
   */
  initializeDefaultRates() {
    for (const [currency, rate] of Object.entries(this.defaultRates)) {
      this.exchangeRates.set(currency, rate);
    }
    this.lastUpdate = new Date();
    logger.info('Currency service initialized with default rates');
  }

  /**
   * Start periodic exchange rate updates
   */
  startPeriodicUpdates() {
    setInterval(() => {
      this.updateExchangeRates().catch(error => {
        logger.error('Failed to update exchange rates:', error);
      });
    }, this.updateInterval);
    
    // Initial update
    this.updateExchangeRates().catch(error => {
      logger.warn('Initial exchange rate update failed, using defaults:', error.message);
    });
  }

  /**
   * Update exchange rates from external API
   */
  async updateExchangeRates() {
    try {
      // Using exchangerate-api.com (free tier)
      const response = await axios.get(
        `https://api.exchangerate-api.com/v4/latest/${this.baseCurrency}`,
        { timeout: 10000 }
      );

      if (response.data && response.data.rates) {
        // Update rates for supported currencies
        for (const currency of this.supportedCurrencies) {
          if (response.data.rates[currency]) {
            this.exchangeRates.set(currency, response.data.rates[currency]);
          }
        }
        
        this.lastUpdate = new Date();
        logger.info('Exchange rates updated successfully');
      }
    } catch (error) {
      logger.error('Failed to fetch exchange rates:', error.message);
      // Keep using existing rates
    }
  }

  /**
   * Get current exchange rate for a currency
   * @param {string} currency - Target currency code
   * @returns {number} - Exchange rate relative to base currency
   */
  getExchangeRate(currency) {
    if (!this.supportedCurrencies.includes(currency)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    
    return this.exchangeRates.get(currency) || this.defaultRates[currency] || 1;
  }

  /**
   * Convert amount from base currency to target currency
   * @param {number} amount - Amount in base currency
   * @param {string} targetCurrency - Target currency code
   * @returns {number} - Converted amount
   */
  convertFromBase(amount, targetCurrency) {
    const rate = this.getExchangeRate(targetCurrency);
    return amount * rate;
  }

  /**
   * Convert amount from source currency to target currency
   * @param {number} amount - Amount in source currency
   * @param {string} sourceCurrency - Source currency code
   * @param {string} targetCurrency - Target currency code
   * @returns {number} - Converted amount
   */
  convertCurrency(amount, sourceCurrency, targetCurrency) {
    if (sourceCurrency === targetCurrency) {
      return amount;
    }

    const sourceRate = this.getExchangeRate(sourceCurrency);
    const targetRate = this.getExchangeRate(targetCurrency);
    
    // Convert to base currency first, then to target currency
    const baseAmount = amount / sourceRate;
    return baseAmount * targetRate;
  }

  /**
   * Detect currency based on user location/country
   * @param {string} countryCode - ISO country code
   * @returns {string} - Currency code
   */
  detectCurrencyByCountry(countryCode) {
    const countryToCurrency = {
      'US': 'USD',
      'CN': 'CNY',
      'GB': 'GBP',
      'EU': 'EUR',
      'DE': 'EUR',
      'FR': 'EUR',
      'IT': 'EUR',
      'ES': 'EUR',
      'JP': 'JPY',
      'CA': 'CAD',
      'AU': 'AUD',
      'NZ': 'AUD',
      'SG': 'USD',
      'HK': 'USD',
      'TW': 'USD'
    };

    return countryToCurrency[countryCode?.toUpperCase()] || 'USD';
  }

  /**
   * Get user's location and currency from IP
   * @param {string} ip - User's IP address
   * @returns {Object} - Location and currency info
   */
  async detectLocationAndCurrency(ip) {
    try {
      // Skip for localhost/private IPs
      if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return {
          country: 'US',
          currency: 'USD',
          detected: false
        };
      }

      // Using ipapi.co for IP geolocation (free tier)
      const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
        timeout: 5000
      });

      if (response.data && response.data.country_code) {
        const country = response.data.country_code;
        const currency = this.detectCurrencyByCountry(country);
        
        return {
          country,
          currency,
          city: response.data.city,
          region: response.data.region,
          detected: true
        };
      }
    } catch (error) {
      logger.warn('Failed to detect location from IP:', error.message);
    }

    // Default fallback
    return {
      country: 'US',
      currency: 'USD',
      detected: false
    };
  }

  /**
   * Get all supported currencies with their current rates
   * @returns {Object} - Currency rates and metadata
   */
  getAllCurrencies() {
    const currencies = {};
    
    for (const currency of this.supportedCurrencies) {
      currencies[currency] = {
        code: currency,
        rate: this.getExchangeRate(currency),
        symbol: this.getCurrencySymbol(currency),
        name: this.getCurrencyName(currency)
      };
    }

    return {
      baseCurrency: this.baseCurrency,
      lastUpdate: this.lastUpdate,
      currencies
    };
  }

  /**
   * Get currency symbol
   * @param {string} currency - Currency code
   * @returns {string} - Currency symbol
   */
  getCurrencySymbol(currency) {
    const symbols = {
      'USD': '$',
      'CNY': '¥',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CAD': 'C$',
      'AUD': 'A$'
    };
    
    return symbols[currency] || currency;
  }

  /**
   * Get currency name
   * @param {string} currency - Currency code
   * @returns {string} - Currency name
   */
  getCurrencyName(currency) {
    const names = {
      'USD': 'US Dollar',
      'CNY': 'Chinese Yuan',
      'EUR': 'Euro',
      'GBP': 'British Pound',
      'JPY': 'Japanese Yen',
      'CAD': 'Canadian Dollar',
      'AUD': 'Australian Dollar'
    };
    
    return names[currency] || currency;
  }

  /**
   * Format currency amount with proper symbol and locale
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @param {string} locale - Locale for formatting
   * @returns {string} - Formatted currency string
   */
  formatCurrency(amount, currency = 'USD', locale = 'en-US') {
    const localeMap = {
      'en': 'en-US',
      'zh': 'zh-CN'
    };
    
    const formatLocale = localeMap[locale] || locale;
    
    try {
      return new Intl.NumberFormat(formatLocale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (error) {
      // Fallback formatting
      const symbol = this.getCurrencySymbol(currency);
      return `${symbol}${amount.toFixed(2)}`;
    }
  }

  /**
   * Get currency conversion info for display
   * @param {number} baseAmount - Amount in base currency
   * @param {string} targetCurrency - Target currency
   * @param {string} locale - Locale for formatting
   * @returns {Object} - Conversion info
   */
  getConversionInfo(baseAmount, targetCurrency, locale = 'en-US') {
    const convertedAmount = this.convertFromBase(baseAmount, targetCurrency);
    const rate = this.getExchangeRate(targetCurrency);
    
    return {
      originalAmount: baseAmount,
      originalCurrency: this.baseCurrency,
      convertedAmount,
      targetCurrency,
      exchangeRate: rate,
      formattedOriginal: this.formatCurrency(baseAmount, this.baseCurrency, locale),
      formattedConverted: this.formatCurrency(convertedAmount, targetCurrency, locale),
      lastUpdate: this.lastUpdate
    };
  }
}

module.exports = new CurrencyService();