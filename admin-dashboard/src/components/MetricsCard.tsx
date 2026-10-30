'use client';

interface MetricsCardProps {
    title: string;
    value: string | number;
    change?: string | null;
    trend?: 'up' | 'down' | 'neutral' | null;
}

export default function MetricsCard({ title, value, change, trend }: MetricsCardProps) {
    const isNeutral = !trend || trend === 'neutral';
    const isPositive = trend === 'up';
    const colorClass = isNeutral ? 'text-gray-400' : (isPositive ? 'text-green-600' : 'text-red-600');
    const arrow = isNeutral ? '' : (isPositive ? '↑' : '↓');

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-2">{title}</div>
            <div className="text-3xl font-bold mb-2">{value}</div>
            {change && (
                <div className={`text-sm flex items-center ${colorClass}`}>
                    <span>{arrow ? `${arrow} ` : ''}{change}</span>
                </div>
            )}
        </div>
    );
}
