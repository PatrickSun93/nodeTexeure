'use client';

import type { EChartsOption, LineSeriesOption } from 'echarts';
import BaseChart from './BaseChart';

/** One point on the x axis: a label plus numeric series (revenue, orderCount, ...). */
export type SeriesPoint = Record<string, string | number | undefined> & {
  period?: string;
  date?: string;
  label?: string;
};

interface AxisTooltipParam {
  axisValue: string;
  color: string;
  value: unknown;
  seriesName: string;
}

interface LineChartProps {
  data?: SeriesPoint[];
  title?: string;
  loading?: boolean;
  height?: number;
  showGrid?: boolean;
  smooth?: boolean;
  areaStyle?: boolean;
  colors?: string[];
}

/**
 * Line Chart Component for Revenue Trends and Time Series Data
 */
export default function LineChart({ 
  data = [], 
  title = '', 
  loading = false,
  height = 400,
  showGrid = true,
  smooth = true,
  areaStyle = false,
  colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
}: LineChartProps) {
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
      formatter: function(raw) {
        const params = raw as unknown as AxisTooltipParam[];
        let tooltip = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].axisValue}</div>`;
        params.forEach((param, index) => {
          const color = param.color;
          const value = typeof param.value === 'number' 
            ? param.value.toLocaleString() 
            : param.value;
          tooltip += `<div style="margin: 2px 0;">
            <span style="display: inline-block; width: 10px; height: 10px; background-color: ${color}; border-radius: 50%; margin-right: 8px;"></span>
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
      type: 'category',
      boundaryGap: false,
      data: data.map(item => item.period || item.date || item.label || ''),
      axisLine: {
        lineStyle: {
          color: '#e5e7eb'
        }
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12,
        formatter: function(value: number) {
          if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          }
          return String(value);
        }
      },
      splitLine: {
        lineStyle: {
          color: '#f3f4f6',
          type: 'dashed'
        }
      }
    },
    series: generateSeries(data, colors, smooth, areaStyle)
  };

  return (
    <BaseChart
      option={option}
      loading={loading}
      style={{ height: `${height}px`, width: '100%' }}
      className="line-chart"
    />
  );
}

/**
 * Generate series data for the chart
 */
function generateSeries(data: SeriesPoint[], colors: string[], smooth: boolean, areaStyle: boolean): LineSeriesOption[] {
  if (!data || data.length === 0) {
    return [];
  }

  // Determine which metrics to show based on data structure
  const sampleItem = data[0];
  const metrics: { key: string; name: string; formatter: (value: number) => string }[] = [];

  if (sampleItem.revenue !== undefined) {
    metrics.push({
      key: 'revenue',
      name: 'Revenue',
      formatter: (value) => `$${value.toLocaleString()}`
    });
  }

  if (sampleItem.orderCount !== undefined) {
    metrics.push({
      key: 'orderCount',
      name: 'Orders',
      formatter: (value) => value.toLocaleString()
    });
  }

  if (sampleItem.avgOrderValue !== undefined) {
    metrics.push({
      key: 'avgOrderValue',
      name: 'Avg Order Value',
      formatter: (value) => `$${value.toFixed(2)}`
    });
  }

  // If no recognized metrics, try to use all numeric properties
  if (metrics.length === 0) {
    Object.keys(sampleItem).forEach(key => {
      if (typeof sampleItem[key] === 'number' && key !== 'period' && key !== 'date') {
        metrics.push({
          key: key,
          name: key.charAt(0).toUpperCase() + key.slice(1),
          formatter: (value) => value.toLocaleString()
        });
      }
    });
  }

  return metrics.map((metric, index) => ({
    name: metric.name,
    type: 'line',
    smooth: smooth,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: {
      width: 3,
      color: colors[index % colors.length]
    },
    itemStyle: {
      color: colors[index % colors.length]
    },
    areaStyle: areaStyle ? {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [{
          offset: 0,
          color: colors[index % colors.length] + '40'
        }, {
          offset: 1,
          color: colors[index % colors.length] + '10'
        }]
      }
    } : undefined,
    data: data.map(item => item[metric.key] || 0)
  }));
}