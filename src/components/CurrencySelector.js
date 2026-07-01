'use client';

import React, { useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
export default function CurrencySelector({ className = '', showLabel = true }) {
  const {
    currentCurrency,
    supportedCurrencies,
    rates,
    setCurrency,
    getCurrencySymbol,
    getCurrencyName,
    loading
  } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);

  const handleCurrencyChange = (currency) => {
    setCurrency(currency);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`}>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('currency')}
        </label>
      )}
      
      <div className="relative">
        <button
          type="button"
          onClick={toggleDropdown}
          disabled={loading}
          className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center">
            <span className="font-medium">
              {getCurrencySymbol(currentCurrency)}
            </span>
            <span className="ml-2 text-gray-600">
              {currentCurrency}
            </span>
            <span className="ml-2 text-sm text-gray-500 hidden sm:inline">
              {getCurrencyName(currentCurrency)}
            </span>
          </span>
          <span className="ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg
              className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                isOpen ? 'transform rotate-180' : ''
              }`}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
            {supportedCurrencies.map((currency) => {
              const isSelected = currency === currentCurrency;
              const rate = rates[currency]?.rate;
              
              return (
                <button
                  key={currency}
                  onClick={() => handleCurrencyChange(currency)}
                  className={`${
                    isSelected
                      ? 'text-white bg-blue-600'
                      : 'text-gray-900 hover:bg-gray-50'
                  } cursor-pointer select-none relative py-2 pl-3 pr-9 w-full text-left transition-colors duration-150`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-medium">
                        {getCurrencySymbol(currency)}
                      </span>
                      <span className="ml-2">
                        {currency}
                      </span>
                      <span className="ml-2 text-sm opacity-75 hidden sm:inline">
                        {getCurrencyName(currency)}
                      </span>
                    </div>
                    {rate && rate !== 1 && (
                      <span className="text-xs opacity-75">
                        {rate.toFixed(4)}
                      </span>
                    )}
                  </div>
                  
                  {isSelected && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                      <svg
                        className="h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// Compact version for header/navbar
export function CompactCurrencySelector({ className = '' }) {
  const {
    currentCurrency,
    supportedCurrencies,
    setCurrency,
    getCurrencySymbol,
    loading
  } = useCurrency();
  
  const [isOpen, setIsOpen] = useState(false);

  const handleCurrencyChange = (currency) => {
    setCurrency(currency);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center space-x-1 px-2 py-1 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md disabled:opacity-50"
      >
        <span>{getCurrencySymbol(currentCurrency)}</span>
        <span>{currentCurrency}</span>
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${
            isOpen ? 'transform rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-32 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
          <div className="py-1">
            {supportedCurrencies.map((currency) => (
              <button
                key={currency}
                onClick={() => handleCurrencyChange(currency)}
                className={`${
                  currency === currentCurrency
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                } block w-full text-left px-4 py-2 text-sm transition-colors duration-150`}
              >
                <span className="font-medium">
                  {getCurrencySymbol(currency)}
                </span>
                <span className="ml-1">
                  {currency}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}