'use client';

import type { BarSeriesOption, EChartsOption, XAXisComponentOption, YAXisComponentOption } from 'echarts';
import BaseChart from './BaseChart';

/** One bar group: a name plus numeric series (totalRevenue, totalQuantity, ...). */
export type BarDatum = Record<string, string | number | undefined> & {
  name?: string;
  label?: string;
};

interface AxisTooltipParam {
  axisValue: string;
  color: string;
  value: number;
  seriesName: string;
}

interface BarChartProps {
  data?: BarDatum[];
  title?: string;
  loading?: boolean;
  height?: number;
  horizontal?: boolean;
  showGrid?: boolean;
  colors?: string[];
}

// Axis labels: compact numbers on the value axis, long category names cut.
function formatAxisLabel(value: string | number, isValueAxis: boolean, truncate: boolean): string {
  if (isValueAxis && typeof value === 'number') {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return String(value);
  }
  const text = String(value);
  return truncate && text.length > 15 ? text.substring(0, 15) + '...' : text;
}

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
}: BarChartProps) {
  const categories = data.map(item => item.name || item.label || '');

  // Prepare chart option
  const option: EChartsOption = {
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
      formatter: function(raw) {
        const params = raw as unknown as AxisTooltipParam[];
        let tooltip = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].axisValue}</div>`;
        params.forEach((param, index) => {
          const color = param.color;
          let value: string;
          
          // Format value based on series name
          if (param.seriesName.toLowerCase().includes('revenue')) {
            value = `$${param.value.toLocaleString()}`;
          } else {
            value = param.value.toLocaleString();
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
      data: horizontal ? undefined : categories,
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
        formatter: (value: string | number) => formatAxisLabel(value, horizontal, true)
      },
      splitLine: horizontal ? {
        lineStyle: {
          color: '#f3f4f6',
          type: 'dashed'
        }
      } : undefined
    } as XAXisComponentOption,
    yAxis: {
      type: horizontal ? 'category' : 'value',
      data: horizontal ? categories : undefined,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12,
        formatter: (value: string | number) => formatAxisLabel(value, !horizontal, horizontal)
      },
      splitLine: !horizontal ? {
        lineStyle: {
          color: '#f3f4f6',
          type: 'dashed'
        }
      } : undefined
    } as YAXisComponentOption,
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
function generateBarSeries(data: BarDatum[], colors: string[], horizontal: boolean): BarSeriesOption[] {
  if (!data || data.length === 0) {
    return [];
  }

  // Determine which metrics to show based on data structure
  const sampleItem = data[0];
  const metrics: { key: string; name: string; formatter: (value: number) => string }[] = [];

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