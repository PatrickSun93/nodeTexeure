const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Enhanced Search Service with Multi-language Support
 * Handles Chinese characters, language-specific indexing, and search analytics
 */
class SearchService {
  constructor() {
    this.searchAnalytics = new Map();
  }

  /**
   * Perform multi-language product search
   * @param {Object} params - Search parameters
   * @returns {Object} Search results with analytics
   */
  async searchProducts(params) {
    const {
      query,
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortOrder = 'desc',
      filters = {}
    } = params;

    try {
      // Track search analytics
      this.trackSearch(query);

      // Build search query
      const searchResults = await this.buildLanguageSpecificSearch(query, {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        sortBy,
        sortOrder,
        filters
      });

      return {
        success: true,
        data: searchResults,
        analytics: this.getSearchAnalytics(query)
      };
    } catch (error) {
      console.error('Search error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build language-specific search query
   * @param {string} query - Search query
   * @param {string} locale - Language locale
   * @param {Object} options - Search options
   * @returns {Object} Search results
   */
  async buildLanguageSpecificSearch(query, options) {
    const { page, limit, sortBy, sortOrder, filters } = options;
    const offset = (page - 1) * limit;

    // Enhanced search query
    const searchPattern = `%${query}%`;
    
    // English search
    const baseQuery = `
        SELECT p.*, 0 as exact_match_score, 0 as relevance_score
        FROM products p
        WHERE p.status = 'approved'
          AND (
            p.name LIKE ?
            OR p.description LIKE ?
            OR p.short_description LIKE ?
          )
      `;

    const countQuery = `
        SELECT COUNT(*) as total
        FROM products p
        WHERE p.status = 'approved'
          AND (
            p.name LIKE ?
            OR p.description LIKE ?
            OR p.short_description LIKE ?
          )
      `;

    const searchParams = [searchPattern, searchPattern, searchPattern];
    const countParams = [searchPattern, searchPattern, searchPattern];

    // Apply filters
    const { filterQuery, filterParams } = this.buildFilterQuery(filters);
    if (filterQuery) {
      baseQuery += filterQuery;
      countQuery += filterQuery;
      searchParams.push(...filterParams);
      countParams.push(...filterParams);
    }

    // Apply sorting
    const sortQuery = this.buildSortQuery(sortBy, sortOrder);
    baseQuery += sortQuery;

    // Add pagination (hardcoded to avoid parameter binding issues)
    baseQuery += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    // Debug logging removed to avoid security middleware issues

    // Execute search query
    const searchResult = await DatabaseUtil.executeQuery(baseQuery, searchParams);
    if (!searchResult.success) {
      console.error('Search query failed:', searchResult.error);
      throw new Error(searchResult.error || 'Search query failed');
    }

    // Execute count query
    const countResult = await DatabaseUtil.executeQuery(countQuery, countParams);
    if (!countResult.success) {
      console.error('Count query failed:', countResult.error);
      throw new Error(countResult.error || 'Count query failed');
    }

    const products = (searchResult.data || []).map(product => ({
      ...product,
      image: product.image || product.thumbnail_small_url || product.thumbnail_medium_url || product.thumbnail_large_url || null,
      relevance_score: parseFloat(product.relevance_score || 0),
      exact_match_score: parseInt(product.exact_match_score || 0)
    }));

    const total = parseInt(countResult.data[0]?.total || 0);

    return {
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        },
        query,
        sortBy,
        sortOrder,
        filters
      };
  }

  /**
   * Build filter query for search
   * @param {Object} filters - Filter parameters
   * @returns {Object} Filter query and parameters
   */
  buildFilterQuery(filters) {
    const conditions = [];
    const params = [];

    // Category filter
    if (filters.category) {
      conditions.push('p.category_id = ?');
      params.push(filters.category);
    }

    // Price range filter
    if (filters.minPrice) {
      conditions.push('p.base_price >= ?');
      params.push(parseFloat(filters.minPrice));
    }
    if (filters.maxPrice) {
      conditions.push('p.base_price <= ?');
      params.push(parseFloat(filters.maxPrice));
    }

    // Material filter
    if (filters.materials && filters.materials.length > 0) {
      const materialConditions = filters.materials.map(() => 
        'JSON_UNQUOTE(JSON_EXTRACT(p.product_details, "$.material")) = ?'
      ).join(' OR ');
      conditions.push(`(${materialConditions})`);
      params.push(...filters.materials);
    }

    // Brand filter
    if (filters.brand) {
      conditions.push('JSON_UNQUOTE(JSON_EXTRACT(p.product_details, "$.brand")) = ?');
      params.push(filters.brand);
    }

    // In stock filter
    if (filters.inStock === true) {
      conditions.push('p.stock_quantity > 0');
    }

    // Rating filter
    if (filters.minRating) {
      conditions.push('p.average_rating >= ?');
      params.push(parseFloat(filters.minRating));
    }

    const filterQuery = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
    return { filterQuery, filterParams: params };
  }

  /**
   * Build sort query
   * @param {string} sortBy - Sort field
   * @param {string} sortOrder - Sort order (asc/desc)
   * @returns {string} Sort query
   */
  buildSortQuery(sortBy, sortOrder = 'desc') {
    const validSortFields = {
      'relevance': '(relevance_score + exact_match_score)',
      'price': 'p.base_price',
      'name': 'p.name',
      'created': 'p.created_at',
      'rating': 'p.average_rating',
      'popularity': 'p.view_count'
    };

    const sortField = validSortFields[sortBy] || validSortFields.relevance;
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    return ` ORDER BY ${sortField} ${order}, p.created_at DESC`;
  }

  /**
   * Get search suggestions based on query and language
   * @param {string} query - Partial search query
   * @param {string} locale - Language locale
   * @returns {Array} Search suggestions
   */
  async getSearchSuggestions(query) {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      // English suggestions
      const suggestionQuery = `
        SELECT DISTINCT 
          p.name as suggestion,
          'product' as type,
          COUNT(*) as frequency
        FROM products p
        WHERE p.status = 'approved'
          AND p.name LIKE ?
        GROUP BY p.name
        ORDER BY frequency DESC, p.name ASC
        LIMIT 8
      `;
      const params = [`%${query}%`];

      const result = await DatabaseUtil.executeQuery(suggestionQuery, params);
      if (!result.success) {
        return [];
      }

      return result.data || [];
    } catch (error) {
      console.error('Suggestion error:', error);
      return [];
    }
  }

  /**
   * Get popular search terms by language
   * @param {string} locale - Language locale
   * @param {number} limit - Number of terms to return
   * @returns {Array} Popular search terms
   */
  async getPopularSearchTerms(limit = 10) {
    try {
      // This would typically come from a search_analytics table
      // For now, return predefined popular terms
      const popularTerms = [
        'Cotton Sheets', 'Silk Pillowcase', 'Memory Foam Mattress', 
        'Bamboo Duvet', 'Linen Bedding', 'Down Pillow', 
        'Weighted Blanket', 'Mattress Protector', 'Egyptian Cotton', 'Luxury Sheets'
      ];

      return popularTerms.slice(0, limit);
    } catch (error) {
      console.error('Popular terms error:', error);
      return [];
    }
  }

  /**
   * Track search analytics
   * @param {string} query - Search query
   * @param {string} locale - Language locale
   */
  trackSearch(query) {
    const key = query.toLowerCase();
    const current = this.searchAnalytics.get(key) || { count: 0, lastSearched: null };
    
    this.searchAnalytics.set(key, {
      count: current.count + 1,
      lastSearched: new Date(),
      query
    });

    // Keep only recent searches (last 1000)
    if (this.searchAnalytics.size > 1000) {
      const entries = Array.from(this.searchAnalytics.entries());
      entries.sort((a, b) => b[1].lastSearched - a[1].lastSearched);
      
      this.searchAnalytics.clear();
      entries.slice(0, 1000).forEach(([key, value]) => {
        this.searchAnalytics.set(key, value);
      });
    }
  }

  /**
   * Get search analytics for a query
   * @param {string} query - Search query
   * @returns {Object} Analytics data
   */
  getSearchAnalytics(query) {
    const analytics = Array.from(this.searchAnalytics.values())
      .filter(item => item.query.toLowerCase().includes(query.toLowerCase()))
      .reduce((acc, item) => {
        acc.totalSearches += item.count;
        return acc;
      }, { totalSearches: 0 });

    return analytics;
  }

  /**
   * Get search trends by language
   * @param {string} locale - Language locale
   * @param {number} limit - Number of trends to return
   * @returns {Array} Search trends
   */
  getSearchTrends(limit = 10) {
    const trends = Array.from(this.searchAnalytics.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(item => ({
        query: item.query,
        count: item.count,
        lastSearched: item.lastSearched
      }));

    return trends;
  }
}

module.exports = new SearchService();