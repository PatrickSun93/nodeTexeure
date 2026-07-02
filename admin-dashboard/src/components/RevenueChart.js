'use client';

import ReactECharts from 'echarts-for-react';
import { useTranslations } from 'next-intl';

export default function RevenueChart({ data = [] }) {
    const t = useTranslations('Charts');
    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross'
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: data.map(d => d.date) || ['Oct 1', 'Oct 8', 'Oct 15', 'Oct 22', 'Oct 29', 'Nov 5', 'Nov 12', 'Nov 19'],
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                formatter: '${value}k'
            }
        },
        series: [
            {
                name: t('revenue'),
                type: 'line',
                smooth: true,
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(210, 180, 140, 0.3)' },
                            { offset: 1, color: 'rgba(210, 180, 140, 0.05)' }
                        ]
                    }
                },
                lineStyle: {
                    color: '#D2B48C',
                    width: 2
                },
                itemStyle: {
                    color: '#D2B48C'
                },
                data: data.map(d => d.value) || [80, 85, 90, 95, 100, 110, 120, 125]
            }
        ]
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">{t('revenueOverTime')}</h3>
            <ReactECharts option={option} style={{ height: '300px' }} />
        </div>
    );
}
