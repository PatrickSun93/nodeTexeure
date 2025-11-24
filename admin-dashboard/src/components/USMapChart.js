'use client';

import ReactECharts from 'echarts-for-react';
import { useEffect, useState } from 'react';

export default function USMapChart({ data = [] }) {
    const [mapReady, setMapReady] = useState(false);

    useEffect(() => {
        // Dynamically import USA map
        import('echarts/map/js/usa').then(() => {
            setMapReady(true);
        }).catch(() => {
            // Fallback: map won't display but won't crash
            console.warn('USA map not available, using mock visualization');
            setMapReady(true);
        });
    }, []);

    const option = {
        tooltip: {
            trigger: 'item',
            formatter: '{b}: ${c}k'
        },
        visualMap: {
            min: 0,
            max: 500,
            text: ['High', 'Low'],
            realtime: false,
            calculable: true,
            inRange: {
                color: ['#e0d5c7', '#D2B48C', '#8B7355']
            },
            bottom: '5%',
            left: '5%'
        },
        series: [
            {
                name: 'Sales',
                type: 'map',
                map: 'USA',
                roam: true,
                emphasis: {
                    label: {
                        show: true
                    },
                    itemStyle: {
                        areaColor: '#D2B48C'
                    }
                },
                data: data.length > 0 ? data : [
                    { name: 'California', value: 450 },
                    { name: 'Texas', value: 380 },
                    { name: 'New York', value: 320 },
                    { name: 'Florida', value: 290 },
                    { name: 'Illinois', value: 250 },
                    { name: 'Pennsylvania', value: 220 },
                    { name: 'Ohio', value: 200 }
                ]
            }
        ]
    };

    if (!mapReady) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Sales by Region (US Map)</h3>
                <div className="h-[400px] flex items-center justify-center text-gray-400">
                    Loading map...
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Sales by Region (US Map)</h3>
            <ReactECharts option={option} style={{ height: '400px' }} />
        </div>
    );
}
