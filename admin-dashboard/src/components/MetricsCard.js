'use client';

export default function MetricsCard({ title, value, change, trend }) {
    const isPositive = trend === 'up';

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-2">{title}</div>
            <div className="text-3xl font-bold mb-2">{value}</div>
            {change && (
                <div className={`text-sm flex items-center ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    <span>{isPositive ? '↑' : '↓'} {change}</span>
                </div>
            )}
        </div>
    );
}
