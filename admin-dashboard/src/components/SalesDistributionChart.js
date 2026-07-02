'use client';

import ReactECharts from 'echarts-for-react';
import { useTranslations } from 'next-intl';

export default function SalesDistributionChart({ data = [] }) {
    const t = useTranslations('Charts');
    const option = {
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)'
        },
        legend: {
            orient: 'vertical',
            right: '10%',
            top: 'center'
        },
        series: [
            {
                name: t('sales'),
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10,
                    borderColor: '#fff',
                    borderWidth: 2
                },
                label: {
                    show: false,
                    position: 'center'
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 20,
                        fontWeight: 'bold'
                    }
                },
                labelLine: {
                    show: false
                },
                data: data.length > 0 ? data : [
                    { value: 450, name: t('siteVisitors'), itemStyle: { color: '#D2B48C' } },
                    { value: 300, name: t('customerBrands'), itemStyle: { color: '#A8D08D' } }
                ]
            }
        ]
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">{t('salesDistribution')}</h3>
            <ReactECharts option={option} style={{ height: '300px' }} />
        </div>
    );
}
