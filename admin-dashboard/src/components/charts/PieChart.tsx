'use client';

import type { EChartsOption } from 'echarts';
import BaseChart from './BaseChart';

/** A slice: order statuses use status/count, other breakdowns name/value. */
export interface PieDatum {
  status?: string;
  name?: string;
  label?: string;
  count?: number;
  value?: number;
  totalValue?: number;
}

interface ItemTooltipParam {
  name: string;
  value: unknown;
  percent: number;
}

interface PieChartProps {
  data?: PieDatum[];
  title?: string;
  loading?: boolean;
  height?: number;
  showLegend?: boolean;
  radius?: [string, string];
  colors?: string[];
}

/**
 * Pie Chart Component for Order Status Distribution and Category Breakdowns
 */
export default function PieChart({ 
  data = [], 
  title = '', 
  loading = false,
  height = 400,
  showLegend = true,
  radius = ['40%', '70%'],
  colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316']
}: PieChartProps) {
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
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: {
        color: '#374151'
      },
      formatter: function(raw) {
        const params = raw as unknown as ItemTooltipParam;
        const value = typeof params.value === 'number' 
          ? params.value.toLocaleString() 
          : params.value;
        return `<div style="font-weight: bold;">${params.name}</div>
                <div>Count: ${value}</div>
                <div>Percentage: ${params.percent}%</div>`;
      }
    },
    legend: showLegend ? {
      orient: 'vertical',
      right: '10%',
      top: 'center',
      textStyle: {
        color: '#6b7280'
      },
      formatter: function(name: string) {
        const item = data.find(d => d.status === name || d.name === name);
        if (item) {
          const value = item.count || item.value || 0;
          return `${name} (${value.toLocaleString()})`;
        }
        return name;
      }
    } : { show: false },
    color: colors,
    series: [{
      name: title || 'Distribution',
      type: 'pie',
      radius: radius,
      center: showLegend ? ['35%', '50%'] : ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 4,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: !showLegend,
        position: 'outside',
        formatter: function(params) {
          return `${params.name}\n${params.percent}%`;
        },
        color: '#374151'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold'
        },
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      },
      labelLine: {
        show: !showLegend
      },
      data: formatPieData(data)
    }]
  };

  return (
    <BaseChart
      option={option}
      loading={loading}
      style={{ height: `${height}px`, width: '100%' }}
      className="pie-chart"
    />
  );
}

/**
 * Format data for pie chart
 */
function formatPieData(data: PieDatum[]) {
  if (!data || data.length === 0) {
    return [];
  }

  return data.map(item => ({
    name: item.status || item.name || item.label || '',
    value: item.count || item.value || 0,
    totalValue: item.totalValue || 0
  }));
}