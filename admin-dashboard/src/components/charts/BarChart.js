'use client';

import BaseChart from './BaseChart';

/**
 * Bar Chart Component for Top Products and Category Performance
 */
export default function BarChart({ 
  data = [], 
  title = '', 
  loading = false,
  height = 400,
  horizontal = false,
  showGrid = true,
  colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
}) {
  // Prepare chart option
  const option = {
    title: {
      text: title,
      left: 'left',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#374151'
      }
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: {
        color: '#374151'
      },
      axisPointer: {
        type: 'shadow'
      },
      formatter: function(params) {
        let tooltip = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].axisValue}</div>`;
        params.forEach((param, index) => {
          const color = param.color;
          let value = param.value;
          
          // Format value based on series name
          if (param.seriesName.toLowerCase().includes('revenue')) {
            value = `$${value.toLocaleString()}`;
          } else {
            value = value.toLocaleString();
          }
          
          tooltip += `<div style="margin: 2px 0;">
            <span style="display: inline-block; width: 10px; height: 10px; background-color: ${color}; margin-right: 8px;"></span>
            ${param.seriesName}: ${value}
          </div>`;
        });
        return tooltip;
      }
    },
    legend: {
      top: 30,
      textStyle: {
        color: '#6b7280'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
      show: showGrid,
      borderColor: '#f3f4f6'
    },
    xAxis: {
      type: horizontal ? 'value' : 'category',
      data: horizontal ? undefined : data.map(item => item.name || item.label),
      axisLine: {
        lineStyle: {
          color: '#e5e7eb'
        }
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12,
        interval: 0,
        rotate: horizontal ? 0 : (data.length > 8 ? 45 : 0),
        formatter: function(value) {
          if (horizontal && typeof value === 'number') {
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M';
            } else if (value >= 1000) {
              return (value / 1000).toFixed(1) + 'K';
            }
            return value;
          }
          return value.length > 15 ? value.substring(0, 15) + '...' : value;
        }
      },
      splitLine: horizontal ? {
        lineStyle: {
          color: '#f3f4f6',
          type: 'dashed'
        }
      } : undefined
    },
    yAxis: {
      type: horizontal ? 'category' : 'value',
      data: horizontal ? data.map(item => item.name || item.label) : undefined,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12,
        formatter: function(value) {
          if (!horizontal && typeof value === 'number') {
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M';
            } else if (value >= 1000) {
              return (value / 1000).toFixed(1) + 'K';
            }
            return value;
          }
          return horizontal && value.length > 15 ? value.substring(0, 15) + '...' : value;
        }
      },
      splitLine: !horizontal ? {
        lineStyle: {
          color: '#f3f4f6',
          type: 'dashed'
        }
      } : undefined
    },
    series: generateBarSeries(data, colors, horizontal)
  };

  return (
    <BaseChart
      option={option}
      loading={loading}
      style={{ height: `${height}px`, width: '100%' }}
      className="bar-chart"
    />
  );
}

/**
 * Generate series data for the bar chart
 */
function generateBarSeries(data, colors, horizontal) {
  if (!data || data.length === 0) {
    return [];
  }

  // Determine which metrics to show based on data structure
  const sampleItem = data[0];
  const metrics = [];

  if (sampleItem.totalRevenue !== undefined) {
    metrics.push({
      key: 'totalRevenue',
      name: 'Revenue',
      formatter: (value) => `$${value.toLocaleString()}`
    });
  }

  if (sampleItem.totalQuantity !== undefined) {
    metrics.push({
      key: 'totalQuantity',
      name: 'Quantity Sold',
      formatter: (value) => value.toLocaleString()
    });
  }

  if (sampleItem.orderCount !== undefined) {
    metrics.push({
      key: 'orderCount',
      name: 'Orders',
      formatter: (value) => value.toLocaleString()
    });
  }

  // If no recognized metrics, try to use all numeric properties
  if (metrics.length === 0) {
    Object.keys(sampleItem).forEach(key => {
      if (typeof sampleItem[key] === 'number' && key !== 'id') {
        metrics.push({
          key: key,
          name: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
          formatter: (value) => value.toLocaleString()
        });
      }
    });
  }

  return metrics.map((metric, index) => ({
    name: metric.name,
    type: 'bar',
    barWidth: '60%',
    itemStyle: {
      color: colors[index % colors.length],
      borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)'
      }
    },
    data: data.map(item => item[metric.key] || 0)
  }));
}