'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Cache configuration
const DEFAULT_CACHE_CONFIG = {
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
  staleWhileRevalidate: true
};

// In-memory cache store
class CacheStore {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  set(key, value, ttl = DEFAULT_CACHE_CONFIG.ttl) {
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Store value with timestamp
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });

    // Set expiration timer
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);
    
    this.timers.set(key, timer);

    // Enforce max size
    if (this.cache.size > DEFAULT_CACHE_CONFIG.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.delete(firstKey);
    }
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    const { value, timestamp, ttl } = item;
    const isExpired = Date.now() - timestamp > ttl;

    if (isExpired) {
      this.delete(key);
      return null;
    }

    return value;
  }

  has(key) {
    return this.cache.has(key) && this.get(key) !== null;
  }

  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return this.cache.delete(key);
  }

  clear() {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  keys() {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance
const globalCache = new CacheStore();

// Cache hook
export function useCache(config = {}) {
  const cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...config };

  const set = useCallback((key, value, ttl = cacheConfig.ttl) => {
    globalCache.set(key, value, ttl);
  }, [cacheConfig.ttl]);

  const get = useCallback((key) => {
    return globalCache.get(key);
  }, []);

  const has = useCallback((key) => {
    return globalCache.has(key);
  }, []);

  const remove = useCallback((key) => {
    return globalCache.delete(key);
  }, []);

  const clear = useCallback(() => {
    globalCache.clear();
  }, []);

  return {
    set,
    get,
    has,
    remove,
    clear,
    size: globalCache.size(),
    keys: globalCache.keys()
  };
}

// Cached API call hook
export function useCachedApi(apiCall, dependencies = [], options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cache = useCache(options.cache);
  const abortControllerRef = useRef(null);

  const {
    enabled = true,
    staleWhileRevalidate = true,
    onSuccess,
    onError
  } = options;

  // Generate cache key from dependencies
  const cacheKey = `api_${JSON.stringify(dependencies)}`;

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;

    // Check cache first
    if (!forceRefresh && cache.has(cacheKey)) {
      const cachedData = cache.get(cacheKey);
      setData(cachedData);
      setError(null);
      
      // If stale-while-revalidate is enabled, fetch fresh data in background
      if (staleWhileRevalidate) {
        fetchData(true);
      }
      return cachedData;
    }

    try {
      setLoading(true);
      setError(null);

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      const result = await apiCall({
        signal: abortControllerRef.current.signal
      });

      // Cache the result
      cache.set(cacheKey, result);
      setData(result);
      
      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        if (onError) {
          onError(err);
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiCall, cacheKey, cache, enabled, staleWhileRevalidate, onSuccess, onError]);

  // Fetch data when dependencies change
  useEffect(() => {
    fetchData();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, dependencies);

  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    cache.remove(cacheKey);
  }, [cache, cacheKey]);

  return {
    data,
    loading,
    error,
    refetch,
    invalidate
  };
}

// Local storage cache hook
export function useLocalStorageCache(key, defaultValue = null, ttl = DEFAULT_CACHE_CONFIG.ttl) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;

    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;

      const parsed = JSON.parse(item);
      const isExpired = Date.now() - parsed.timestamp > ttl;

      if (isExpired) {
        localStorage.removeItem(key);
        return defaultValue;
      }

      return parsed.value;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return defaultValue;
    }
  });

  const setCachedValue = useCallback((newValue) => {
    try {
      setValue(newValue);
      
      if (typeof window !== 'undefined') {
        const item = {
          value: newValue,
          timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(item));
      }
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }, [key]);

  const removeCachedValue = useCallback(() => {
    try {
      setValue(defaultValue);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Error removing from localStorage:', error);
    }
  }, [key, defaultValue]);

  return [value, setCachedValue, removeCachedValue];
}

// Session storage cache hook
export function useSessionStorageCache(key, defaultValue = null) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;

    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Error reading from sessionStorage:', error);
      return defaultValue;
    }
  });

  const setCachedValue = useCallback((newValue) => {
    try {
      setValue(newValue);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(key, JSON.stringify(newValue));
      }
    } catch (error) {
      console.error('Error writing to sessionStorage:', error);
    }
  }, [key]);

  const removeCachedValue = useCallback(() => {
    try {
      setValue(defaultValue);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Error removing from sessionStorage:', error);
    }
  }, [key, defaultValue]);

  return [value, setCachedValue, removeCachedValue];
}

export default useCache;