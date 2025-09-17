'use client';

import React from 'react';
import { useCurrency } from '../contexts/CurrencyContext';

export default function PriceDisplay({ 
  price, 
  originalCurrency = 'USD',
  className = '',
  showOriginal = false,
  size = 'base',
  showCurrency = true
}) {
  const { 
    currentCurrency, 
    convertCurrency, 
    formatCurrency,
    getCurrencySymbol 
  } = useCurrency();

  if (!price || isNaN(price)) {
    return <span className={className}>-</span>;
  }

  const convertedPrice = convertCurrency(price, originalCurrency, currentCurrency);
  const formattedPrice = formatCurrency(convertedPrice, currentCurrency);
  const formattedOriginal = formatCurrency(price, originalCurrency);

  // Size classes
  const sizeClasses = {
    'xs': 'text-xs',
    'sm': 'text-sm',
    'base': 'text-base',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl'
  };

  const sizeClass = sizeClasses[size] || sizeClasses.base;

  // Show conversion info if currencies are different and showOriginal is true
  const showConversion = showOriginal && originalCurrency !== currentCurrency;

  return (
    <div className={`${className} ${sizeClass}`}>
      <span className="font-semibold">
        {showCurrency ? formattedPrice : convertedPrice.toFixed(2)}
      </span>
      
      {showConversion && (
        <span className="ml-2 text-sm text-gray-500 line-through">
          {showCurrency ? formattedOriginal : `${getCurrencySymbol(originalCurrency)}${price.toFixed(2)}`}
        </span>
      )}
    </div>
  );
}

// Component for displaying price ranges
export function PriceRangeDisplay({ 
  minPrice, 
  maxPrice, 
  originalCurrency = 'USD',
  className = '',
  size = 'base',
  showCurrency = true
}) {
  const { 
    currentCurrency, 
    convertCurrency, 
    formatCurrency 
  } = useCurrency();

  if (!minPrice || !maxPrice || isNaN(minPrice) || isNaN(maxPrice)) {
    return <span className={className}>-</span>;
  }

  const convertedMinPrice = convertCurrency(minPrice, originalCurrency, currentCurrency);
  const convertedMaxPrice = convertCurrency(maxPrice, originalCurrency, currentCurrency);

  const sizeClasses = {
    'xs': 'text-xs',
    'sm': 'text-sm',
    'base': 'text-base',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl'
  };

  const sizeClass = sizeClasses[size] || sizeClasses.base;

  return (
    <div className={`${className} ${sizeClass}`}>
      <span className="font-semibold">
        {showCurrency 
          ? `${formatCurrency(convertedMinPrice, currentCurrency)} - ${formatCurrency(convertedMaxPrice, currentCurrency)}`
          : `${convertedMinPrice.toFixed(2)} - ${convertedMaxPrice.toFixed(2)}`
        }
      </span>
    </div>
  );
}

// Component for displaying discounted prices
export function DiscountedPriceDisplay({ 
  originalPrice, 
  discountedPrice, 
  originalCurrency = 'USD',
  className = '',
  size = 'base',
  showCurrency = true,
  showPercentage = true
}) {
  const { 
    currentCurrency, 
    convertCurrency, 
    formatCurrency 
  } = useCurrency();

  if (!originalPrice || !discountedPrice || isNaN(originalPrice) || isNaN(discountedPrice)) {
    return <span className={className}>-</span>;
  }

  const convertedOriginal = convertCurrency(originalPrice, originalCurrency, currentCurrency);
  const convertedDiscounted = convertCurrency(discountedPrice, originalCurrency, currentCurrency);
  
  const discountPercentage = Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);

  const sizeClasses = {
    'xs': 'text-xs',
    'sm': 'text-sm',
    'base': 'text-base',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl'
  };

  const sizeClass = sizeClasses[size] || sizeClasses.base;

  return (
    <div className={`${className} ${sizeClass} flex items-center space-x-2`}>
      <span className="font-semibold text-red-600">
        {showCurrency 
          ? formatCurrency(convertedDiscounted, currentCurrency)
          : convertedDiscounted.toFixed(2)
        }
      </span>
      
      <span className="text-gray-500 line-through">
        {showCurrency 
          ? formatCurrency(convertedOriginal, currentCurrency)
          : convertedOriginal.toFixed(2)
        }
      </span>
      
      {showPercentage && discountPercentage > 0 && (
        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-medium">
          -{discountPercentage}%
        </span>
      )}
    </div>
  );
}

// Component for displaying currency conversion info
export function CurrencyConversionInfo({ 
  basePrice, 
  baseCurrency = 'USD',
  className = ''
}) {
  const { 
    currentCurrency, 
    getConversionInfo,
    lastUpdate 
  } = useCurrency();

  if (!basePrice || isNaN(basePrice) || baseCurrency === currentCurrency) {
    return null;
  }

  const conversionInfo = getConversionInfo(basePrice, currentCurrency);

  return (
    <div className={`${className} text-xs text-gray-500 mt-1`}>
      <div>
        Rate: 1 {baseCurrency} = {conversionInfo.exchangeRate.toFixed(4)} {currentCurrency}
      </div>
      {lastUpdate && (
        <div>
          Updated: {new Date(lastUpdate).toLocaleString()}
        </div>
      )}
    </div>
  );
}