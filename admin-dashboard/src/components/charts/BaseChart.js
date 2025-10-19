'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

/**
 * Base Chart Component
 * Provides common functionality for all ECharts components
 */
export default function BaseChart({ 
  option, 
  style = { height: '400px', width: '100%' }, 
  className = '',
  loading = false,
  onChartReady,
  onEvents = {},
  theme = 'default'
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [isLoading, setIsLoading] = useState(loading);

  // Initialize chart
  useEffect(() => {
    if (chartRef.current) {
      // Dispose existing chart instance
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }

      // Create new chart instance
      chartInstance.current = echarts.init(chartRef.current, theme);

      // Set up event listeners
      Object.entries(onEvents).forEach(([eventName, handler]) => {
        chartInstance.current.on(eventName, handler);
      });

      // Notify parent component that chart is ready
      if (onChartReady) {
        onChartReady(chartInstance.current);
      }
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [theme, onChartReady]);

  // Update chart options
  useEffect(() => {
    if (chartInstance.current && option) {
      chartInstance.current.setOption(option, true);
    }
  }, [option]);

  // Handle loading state
  useEffect(() => {
    if (chartInstance.current) {
      if (loading) {
        chartInstance.current.showLoading('default', {
          text: 'Loading...',
          color: '#3b82f6',
          textColor: '#374151',
          maskColor: 'rgba(255, 255, 255, 0.8)',
          zlevel: 0
        });
      } else {
        chartInstance.current.hideLoading();
      }
    }
    setIsLoading(loading);
  }, [loading]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div 
      ref={chartRef} 
      style={style} 
      className={`${className} ${isLoading ? 'opacity-75' : ''}`}
    />
  );
}