'use client';

import { useState, useEffect } from 'react';
import { usePerformanceBudget, useMemoryUsage } from '../lib/usePerformance';

/**
 * Performance Monitor Component
 * Shows performance metrics in development mode
 */
export default function PerformanceMonitor({ enabled = false }) {
  const { metrics, warnings } = usePerformanceBudget();
  const memoryInfo = useMemoryUsage();
  const [isVisible, setIsVisible] = useState(false);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    setIsDev(process.env.NODE_ENV === 'development');
  }, []);

  // Only show in development or when explicitly enabled
  if (!enabled && !isDev) return null;

  const formatMetric = (value, unit = 'ms') => {
    if (value === null || value === undefined) return 'N/A';
    return `${Math.round(value)}${unit}`;
  };

  const getMetricRating = (metric, value) => {
    if (value === null || value === undefined) return 'unknown';
    
    const thresholds = {
      lcp: { good: 2500, poor: 4000 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 },
      fcp: { good: 1800, poor: 3000 },
      ttfb: { good: 800, poor: 1800 }
    };
    
    const threshold = thresholds[metric];
    if (!threshold) return 'unknown';
    
    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="perf-monitor-toggle"
        title="Toggle Performance Monitor"
      >
        📊
      </button>

      {/* Performance Panel */}
      {isVisible && (
        <div className="perf-monitor-panel">
          <div className="perf-monitor-header">
            <h3>Performance Monitor</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="perf-monitor-close"
            >
              ×
            </button>
          </div>

          {/* Core Web Vitals */}
          <div className="perf-monitor-section">
            <h4>Core Web Vitals</h4>
            <div className="perf-metrics-grid">
              <div className={`perf-metric ${getMetricRating('lcp', metrics.lcp)}`}>
                <span className="perf-metric-label">LCP</span>
                <span className="perf-metric-value">{formatMetric(metrics.lcp)}</span>
              </div>
              <div className={`perf-metric ${getMetricRating('fid', metrics.fid)}`}>
                <span className="perf-metric-label">FID</span>
                <span className="perf-metric-value">{formatMetric(metrics.fid)}</span>
              </div>
              <div className={`perf-metric ${getMetricRating('cls', metrics.cls)}`}>
                <span className="perf-metric-label">CLS</span>
                <span className="perf-metric-value">{formatMetric(metrics.cls, '')}</span>
              </div>
            </div>
          </div>

          {/* Other Metrics */}
          <div className="perf-monitor-section">
            <h4>Other Metrics</h4>
            <div className="perf-metrics-grid">
              <div className={`perf-metric ${getMetricRating('fcp', metrics.fcp)}`}>
                <span className="perf-metric-label">FCP</span>
                <span className="perf-metric-value">{formatMetric(metrics.fcp)}</span>
              </div>
              <div className={`perf-metric ${getMetricRating('ttfb', metrics.ttfb)}`}>
                <span className="perf-metric-label">TTFB</span>
                <span className="perf-metric-value">{formatMetric(metrics.ttfb)}</span>
              </div>
            </div>
          </div>

          {/* Memory Usage */}
          {memoryInfo && (
            <div className="perf-monitor-section">
              <h4>Memory Usage</h4>
              <div className="perf-memory-info">
                <div className="perf-memory-bar">
                  <div 
                    className="perf-memory-fill"
                    style={{ width: `${Math.min(memoryInfo.usagePercentage, 100)}%` }}
                  />
                </div>
                <div className="perf-memory-text">
                  {Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024)}MB / 
                  {Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024)}MB
                  ({Math.round(memoryInfo.usagePercentage)}%)
                </div>
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="perf-monitor-section">
              <h4>Performance Warnings</h4>
              <div className="perf-warnings">
                {warnings.map((warning, index) => (
                  <div key={index} className={`perf-warning ${warning.severity}`}>
                    <strong>{warning.metric}</strong>: {formatMetric(warning.value)} 
                    (threshold: {formatMetric(warning.threshold)})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="perf-monitor-section">
            <div className="perf-legend">
              <div className="perf-legend-item">
                <span className="perf-legend-color good"></span>
                <span>Good</span>
              </div>
              <div className="perf-legend-item">
                <span className="perf-legend-color needs-improvement"></span>
                <span>Needs Improvement</span>
              </div>
              <div className="perf-legend-item">
                <span className="perf-legend-color poor"></span>
                <span>Poor</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .perf-monitor-toggle {
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          border: none;
          font-size: 20px;
          cursor: pointer;
          z-index: 9998;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .perf-monitor-toggle:hover {
          background: rgba(0, 0, 0, 0.9);
          transform: scale(1.1);
        }

        .perf-monitor-panel {
          position: fixed;
          bottom: 80px;
          left: 20px;
          width: 320px;
          max-height: 500px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          z-index: 9999;
          overflow-y: auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .perf-monitor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
          border-radius: 12px 12px 0 0;
        }

        .perf-monitor-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
        }

        .perf-monitor-close {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .perf-monitor-close:hover {
          color: #374151;
        }

        .perf-monitor-section {
          padding: 16px;
          border-bottom: 1px solid #f3f4f6;
        }

        .perf-monitor-section:last-child {
          border-bottom: none;
        }

        .perf-monitor-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .perf-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
          gap: 8px;
        }

        .perf-metric {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px;
          border-radius: 6px;
          font-size: 12px;
        }

        .perf-metric.good {
          background: #dcfce7;
          color: #166534;
        }

        .perf-metric.needs-improvement {
          background: #fef3c7;
          color: #92400e;
        }

        .perf-metric.poor {
          background: #fef2f2;
          color: #991b1b;
        }

        .perf-metric.unknown {
          background: #f3f4f6;
          color: #6b7280;
        }

        .perf-metric-label {
          font-weight: 600;
          margin-bottom: 2px;
        }

        .perf-metric-value {
          font-weight: 500;
        }

        .perf-memory-info {
          font-size: 12px;
        }

        .perf-memory-bar {
          width: 100%;
          height: 8px;
          background: #f3f4f6;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .perf-memory-fill {
          height: 100%;
          background: linear-gradient(90deg, #22c55e 0%, #eab308 70%, #ef4444 100%);
          transition: width 0.3s ease;
        }

        .perf-memory-text {
          color: #6b7280;
          text-align: center;
        }

        .perf-warnings {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .perf-warning {
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .perf-warning.medium {
          background: #fef3c7;
          color: #92400e;
        }

        .perf-warning.high {
          background: #fef2f2;
          color: #991b1b;
        }

        .perf-legend {
          display: flex;
          gap: 12px;
          font-size: 12px;
        }

        .perf-legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .perf-legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .perf-legend-color.good {
          background: #22c55e;
        }

        .perf-legend-color.needs-improvement {
          background: #eab308;
        }

        .perf-legend-color.poor {
          background: #ef4444;
        }

        @media (max-width: 640px) {
          .perf-monitor-panel {
            left: 10px;
            right: 10px;
            width: auto;
          }

          .perf-monitor-toggle {
            left: 10px;
            bottom: 10px;
          }
        }
      `}</style>
    </>
  );
}