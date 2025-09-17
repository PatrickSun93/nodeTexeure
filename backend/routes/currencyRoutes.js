const express = require('express');
const router = express.Router();
const currencyService = require('../services/currencyService');
const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Get all supported currencies with current exchange rates
 * GET /api/currency/rates
 */
router.get('/rates', async (req, res) => {
  try {
    const currencies = currencyService.getAllCurrencies();
    
    res.json(ResponseFormatter.success({
      currencies: currencies.currencies,
      baseCurrency: currencies.baseCurrency,
      lastUpdate: currencies.lastUpdate
    }));
  } catch (error) {
    logger.error('Error fetching currency rates:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to fetch currency rates'));
  }
});

/**
 * Convert currency amount
 * POST /api/currency/convert
 * Body: { amount, fromCurrency, toCurrency }
 */
router.post('/convert', async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;
    
    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json(ResponseFormatter.failure('Missing required fields: amount, fromCurrency, toCurrency'));
    }

    if (isNaN(amount) || amount < 0) {
      return res.status(400).json(ResponseFormatter.failure('Invalid amount'));
    }

    const convertedAmount = currencyService.convertCurrency(
      parseFloat(amount),
      fromCurrency,
      toCurrency
    );

    const fromRate = currencyService.getExchangeRate(fromCurrency);
    const toRate = currencyService.getExchangeRate(toCurrency);

    res.json(ResponseFormatter.success({
      originalAmount: parseFloat(amount),
      fromCurrency,
      toCurrency,
      convertedAmount,
      exchangeRate: toRate / fromRate,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    logger.error('Error converting currency:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Currency conversion failed'));
  }
});

/**
 * Detect user currency based on IP location
 * GET /api/currency/detect
 */
router.get('/detect', async (req, res) => {
  try {
    // Get user's IP address
    const ip = req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const locationInfo = await currencyService.detectLocationAndCurrency(ip);
    
    res.json(ResponseFormatter.success({
      ip: ip,
      country: locationInfo.country,
      currency: locationInfo.currency,
      city: locationInfo.city,
      region: locationInfo.region,
      detected: locationInfo.detected,
      supportedCurrencies: currencyService.supportedCurrencies
    }));
  } catch (error) {
    logger.error('Error detecting currency:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to detect currency'));
  }
});

/**
 * Get formatted currency display
 * POST /api/currency/format
 * Body: { amount, currency, locale }
 */
router.post('/format', async (req, res) => {
  try {
    const { amount, currency = 'USD', locale = 'en-US' } = req.body;
    
    if (!amount) {
      return res.status(400).json(ResponseFormatter.failure('Amount is required'));
    }

    if (isNaN(amount)) {
      return res.status(400).json(ResponseFormatter.failure('Invalid amount'));
    }

    const formatted = currencyService.formatCurrency(
      parseFloat(amount),
      currency,
      locale
    );

    const symbol = currencyService.getCurrencySymbol(currency);
    const name = currencyService.getCurrencyName(currency);

    res.json(ResponseFormatter.success({
      amount: parseFloat(amount),
      currency,
      locale,
      formatted,
      symbol,
      name
    }));
  } catch (error) {
    logger.error('Error formatting currency:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Currency formatting failed'));
  }
});

/**
 * Get conversion info for product pricing
 * POST /api/currency/product-pricing
 * Body: { basePrice, targetCurrency, locale }
 */
router.post('/product-pricing', async (req, res) => {
  try {
    const { basePrice, targetCurrency = 'USD', locale = 'en-US' } = req.body;
    
    if (!basePrice) {
      return res.status(400).json(ResponseFormatter.failure('Base price is required'));
    }

    if (isNaN(basePrice) || basePrice < 0) {
      return res.status(400).json(ResponseFormatter.failure('Invalid base price'));
    }

    const conversionInfo = currencyService.getConversionInfo(
      parseFloat(basePrice),
      targetCurrency,
      locale
    );

    res.json(ResponseFormatter.success(conversionInfo));
  } catch (error) {
    logger.error('Error getting product pricing:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to get product pricing'));
  }
});

/**
 * Update exchange rates manually (admin only)
 * POST /api/currency/update-rates
 */
router.post('/update-rates', async (req, res) => {
  try {
    // Note: In a real application, you'd want to add admin authentication here
    await currencyService.updateExchangeRates();
    
    const currencies = currencyService.getAllCurrencies();
    
    res.json(ResponseFormatter.success({
      message: 'Exchange rates updated successfully',
      lastUpdate: currencies.lastUpdate,
      currencies: currencies.currencies
    }));
  } catch (error) {
    logger.error('Error updating exchange rates:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to update exchange rates'));
  }
});

module.exports = router;