'use client';

import ReactECharts from 'echarts-for-react';
import { useTranslations } from 'next-intl';

export default function SalesByRegionChart({ data = [] }) {
    const t = useTranslations('Charts');
    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            }
        },
        grid: {
            left: '15%',
            right: '4%',
            bottom: '3%',
            top: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            axisLabel: {
                formatter: '${value}k'
            }
        },
        yAxis: {
            type: 'category',
            data: data.map(d => d.region) || ['San Jose Sun', 'California Texas', 'Rio Monte Sul', 'Customer Texas', 'San Join Semi']
        },
        series: [
            {
                name: t('sales'),
                type: 'bar',
                data: data.map(d => d.value) || [120, 150, 180, 200, 250],
                itemStyle: {
                    color: '#D2B48C',
                    borderRadius: [0, 4, 4, 0]
                },
                barWidth: '50%'
            }
        ]
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">{t('salesDashboard')}</h3>
            <ReactECharts option={option} style={{ height: '300px' }} />
        </div>
    );
}
