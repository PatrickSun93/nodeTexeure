const express = require('express');
const SearchService = require('../services/searchService');
const ResponseFormatter = require('../utils/responseFormatter');
const router = express.Router();

/**
 * Enhanced Search Routes with Multi-language Support
 */

// GET /api/search - Main search endpoint
router.get('/', async (req, res) => {
  // Debug logging removed
  try {
    const {
      q: query,
      locale = 'en',
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortOrder = 'desc',
      category,
      minPrice,
      maxPrice,
      materials,
      brand,
      inStock,
      minRating
    } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json(
        ResponseFormatter.failure('Search query is required')
      );
    }

    // Parse materials filter
    let materialsList = [];
    if (materials) {
      if (Array.isArray(materials)) {
        materialsList = materials;
      } else {
        materialsList = materials.split(',').map(m => m.trim()).filter(Boolean);
      }
    }

    const filters = {
      category,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      materials: materialsList.length > 0 ? materialsList : undefined,
      brand,
      inStock: inStock === 'true',
      minRating: minRating ? parseFloat(minRating) : undefined
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const searchParams = {
      query: query.trim(),
      locale,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
      filters
    };

    const result = await SearchService.searchProducts(searchParams);

    if (result.success) {
      res.json(ResponseFormatter.success('Search completed successfully', result.data));
    } else {
      res.status(500).json(ResponseFormatter.failure('Search failed', { error: result.error }));
    }
  } catch (error) {
    console.error('Search route error:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/search/suggestions - Search suggestions endpoint
router.get('/suggestions', async (req, res) => {
  try {
    const { q: query, locale = 'en' } = req.query;

    if (!query || query.trim().length < 2) {
      return res.json(ResponseFormatter.success('Suggestions retrieved', { suggestions: [] }));
    }

    const suggestions = await SearchService.getSearchSuggestions(query.trim(), locale);
    
    res.json(ResponseFormatter.success('Suggestions retrieved successfully', { suggestions }));
  } catch (error) {
    console.error('Suggestions route error:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/search/popular - Popular search terms endpoint
router.get('/popular', async (req, res) => {
  try {
    const { locale = 'en', limit = 10 } = req.query;

    const popularTerms = await SearchService.getPopularSearchTerms(locale, parseInt(limit));
    
    res.json(ResponseFormatter.success('Popular terms retrieved successfully', { 
      popularTerms,
      locale,
      limit: parseInt(limit)
    }));
  } catch (error) {
    console.error('Popular terms route error:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/search/trends - Search trends endpoint
router.get('/trends', async (req, res) => {
  try {
    const { locale = 'en', limit = 10 } = req.query;

    const trends = SearchService.getSearchTrends(locale, parseInt(limit));
    
    res.json(ResponseFormatter.success('Search trends retrieved successfully', { 
      trends,
      locale,
      limit: parseInt(limit)
    }));
  } catch (error) {
    console.error('Search trends route error:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/search/analytics - Search analytics endpoint
router.get('/analytics', async (req, res) => {
  try {
    const { q: query } = req.query;

    if (!query) {
      return res.status(400).json(
        ResponseFormatter.failure('Query parameter is required for analytics')
      );
    }

    const analytics = SearchService.getSearchAnalytics(query);
    
    res.json(ResponseFormatter.success('Search analytics retrieved successfully', { 
      query,
      analytics
    }));
  } catch (error) {
    console.error('Search analytics route error:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;