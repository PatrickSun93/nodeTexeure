'use client';

import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Currency context
const CurrencyContext = createContext();

// Action types
const CURRENCY_ACTIONS = {
  SET_CURRENCY: 'SET_CURRENCY',
  SET_RATES: 'SET_RATES',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_LOCATION: 'SET_LOCATION'
};

// Initial state
const initialState = {
  currentCurrency: 'USD',
  rates: {},
  baseCurrency: 'USD',
  lastUpdate: null,
  loading: false,
  error: null,
  location: {
    country: 'US',
    detected: false
  },
  supportedCurrencies: ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']
};

// Reducer
function currencyReducer(state, action) {
  switch (action.type) {
    case CURRENCY_ACTIONS.SET_CURRENCY:
      return {
        ...state,
        currentCurrency: action.payload
      };
    case CURRENCY_ACTIONS.SET_RATES:
      return {
        ...state,
        rates: action.payload.currencies || {},
        baseCurrency: action.payload.baseCurrency || 'USD',
        lastUpdate: action.payload.lastUpdate,
        loading: false,
        error: null
      };
    case CURRENCY_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };
    case CURRENCY_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false
      };
    case CURRENCY_ACTIONS.SET_LOCATION:
      return {
        ...state,
        location: action.payload,
        currentCurrency: action.payload.currency || state.currentCurrency
      };
    default:
      return state;
  }
}

// Currency provider component
export function CurrencyProvider({ children }) {
  const [state, dispatch] = useReducer(currencyReducer, initialState);

  // Load currency from localStorage on mount
  useEffect(() => {
    const savedCurrency = localStorage.getItem('preferred-currency');
    if (savedCurrency && state.supportedCurrencies.includes(savedCurrency)) {
      dispatch({ type: CURRENCY_ACTIONS.SET_CURRENCY, payload: savedCurrency });
    } else {
      // Detect currency based on location
      detectCurrency();
    }
    
    // Load exchange rates
    fetchExchangeRates();
  }, []);

  // Save currency preference to localStorage
  useEffect(() => {
    localStorage.setItem('preferred-currency', state.currentCurrency);
  }, [state.currentCurrency]);

  // Detect user's currency based on location
  const detectCurrency = async () => {
    try {
      const response = await fetch('/api/currency/detect');
      const data = await response.json();
      
      if (data.success && data.data) {
        dispatch({ type: CURRENCY_ACTIONS.SET_LOCATION, payload: data.data });
      }
    } catch (error) {
      console.warn('Failed to detect currency:', error);
    }
  };

  // Fetch current exchange rates
  const fetchExchangeRates = async () => {
    dispatch({ type: CURRENCY_ACTIONS.SET_LOADING, payload: true });
    
    try {
      const response = await fetch('/api/currency/rates');
      const data = await response.json();
      
      if (data.success && data.data) {
        dispatch({ type: CURRENCY_ACTIONS.SET_RATES, payload: data.data });
      } else {
        throw new Error(data.message || 'Failed to fetch rates');
      }
    } catch (error) {
      dispatch({ type: CURRENCY_ACTIONS.SET_ERROR, payload: error.message });
      console.error('Failed to fetch exchange rates:', error);
    }
  };

  // Set currency
  const setCurrency = (currency) => {
    if (state.supportedCurrencies.includes(currency)) {
      dispatch({ type: CURRENCY_ACTIONS.SET_CURRENCY, payload: currency });
    }
  };

  // Convert amount from base currency to current currency
  const convertFromBase = (amount, targetCurrency = state.currentCurrency) => {
    if (!amount || isNaN(amount)) return 0;
    
    const rate = state.rates[targetCurrency]?.rate || 1;
    return amount * rate;
  };

  // Convert between any two currencies
  const convertCurrency = (amount, fromCurrency, toCurrency = state.currentCurrency) => {
    if (!amount || isNaN(amount)) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    const fromRate = state.rates[fromCurrency]?.rate || 1;
    const toRate = state.rates[toCurrency]?.rate || 1;
    
    // Convert to base currency first, then to target currency
    const baseAmount = amount / fromRate;
    return baseAmount * toRate;
  };

  // Format currency amount
  const formatCurrency = (amount, currency = state.currentCurrency) => {
    if (!amount && amount !== 0) return '';
    
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (error) {
      return formatCurrencyFallback(amount, currency);
    }
  };

  // Fallback currency formatting
  const formatCurrencyFallback = (amount, currency) => {
    const symbols = {
      'USD': '$',
      'CNY': '¥',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CAD': 'C$',
      'AUD': 'A$'
    };
    
    const symbol = symbols[currency] || currency;
    return `${symbol}${Number(amount).toFixed(2)}`;
  };

  // Get currency symbol
  const getCurrencySymbol = (currency = state.currentCurrency) => {
    return state.rates[currency]?.symbol || currency;
  };

  // Get currency name
  const getCurrencyName = (currency = state.currentCurrency) => {
    return state.rates[currency]?.name || currency;
  };

  // Get conversion info for display
  const getConversionInfo = (baseAmount, targetCurrency = state.currentCurrency) => {
    const convertedAmount = convertFromBase(baseAmount, targetCurrency);
    const rate = state.rates[targetCurrency]?.rate || 1;
    
    return {
      originalAmount: baseAmount,
      originalCurrency: state.baseCurrency,
      convertedAmount,
      targetCurrency,
      exchangeRate: rate,
      formattedOriginal: formatCurrency(baseAmount, state.baseCurrency),
      formattedConverted: formatCurrency(convertedAmount, targetCurrency),
      lastUpdate: state.lastUpdate
    };
  };

  const value = {
    // State
    currentCurrency: state.currentCurrency,
    rates: state.rates,
    baseCurrency: state.baseCurrency,
    lastUpdate: state.lastUpdate,
    loading: state.loading,
    error: state.error,
    location: state.location,
    supportedCurrencies: state.supportedCurrencies,
    
    // Actions
    setCurrency,
    fetchExchangeRates,
    
    // Utilities
    convertFromBase,
    convertCurrency,
    formatCurrency,
    getCurrencySymbol,
    getCurrencyName,
    getConversionInfo
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

// Custom hook to use currency context
export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

export default CurrencyContext;