'use client';

import BaseChart from './BaseChart';

/**
 * Gauge Chart Component for KPI Indicators and Progress Metrics
 */
export default function GaugeChart({ 
  value = 0,
  max = 100,
  title = '', 
  loading = false,
  height = 300,
  unit = '',
  thresholds = [
    { value: 30, color: '#ef4444' },  // Red
    { value: 70, color: '#f59e0b' },  // Yellow
    { value: 100, color: '#10b981' }  // Green
  ]
}) {
  // Calculate percentage
  const percentage = Math.min((value / max) * 100, 100);
  
  // Determine color based on thresholds
  const getColor = (val) => {
    for (let i = 0; i < thresholds.length; i++) {
      if (val <= thresholds[i].value) {
        return thresholds[i].color;
      }
    }
    return thresholds[thresholds.length - 1].color;
  };

  // Prepare chart option
  const option = {
    title: {
      text: title,
      left: 'center',
      top: '10%',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#374151'
      }
    },
    series: [{
      name: title,
      type: 'gauge',
      center: ['50%', '60%'],
      radius: '80%',
      min: 0,
      max: max,
      splitNumber: 5,
      progress: {
        show: true,
        width: 18,
        itemStyle: {
          color: getColor(percentage)
        }
      },
      pointer: {
        show: true,
        length: '60%',
        width: 6,
        itemStyle: {
          color: '#374151'
        }
      },
      axisLine: {
        lineStyle: {
          width: 18,
          color: [
            [0.3, '#ef4444'],
            [0.7, '#f59e0b'],
            [1, '#10b981']
          ]
        }
      },
      axisTick: {
        distance: -30,
        length: 8,
        lineStyle: {
          color: '#fff',
          width: 2
        }
      },
      splitLine: {
        distance: -30,
        length: 30,
        lineStyle: {
          color: '#fff',
          width: 4
        }
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12,
        distance: -60,
        formatter: function(value) {
          if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          }
          return value;
        }
      },
      detail: {
        valueAnimation: true,
        formatter: function(value) {
          let formattedValue;
          if (value >= 1000000) {
            formattedValue = (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            formattedValue = (value / 1000).toFixed(1) + 'K';
          } else {
            formattedValue = Math.round(value);
          }
          return `{value|${formattedValue}}{unit|${unit}}`;
        },
        rich: {
          value: {
            fontSize: 24,
            fontWeight: 'bold',
            color: '#374151'
          },
          unit: {
            fontSize: 14,
            color: '#6b7280',
            padding: [0, 0, 0, 4]
          }
        },
        offsetCenter: [0, '40%']
      },
      data: [{
        value: value,
        name: title
      }]
    }]
  };

  return (
    <BaseChart
      option={option}
      loading={loading}
      style={{ height: `${height}px`, width: '100%' }}
      className="gauge-chart"
    />
  );
}