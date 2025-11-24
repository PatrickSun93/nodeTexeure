'use client';

export default function RecentOrdersTable({ orders = [] }) {
    const mockOrders = [
        { id: '#3032', customer: 'Olivia Martin', date: '2023-10-28', amount: '$245.95', status: 'Shipped' },
        { id: '#3031', customer: 'Liam Anderson', date: '2023-10-27', amount: '$189.50', status: 'Shipped' },
        { id: '#3030', customer: 'Sophia Garcia', date: '2023-10-27', amount: '$320.00', status: 'Pending' },
        { id: '#3029', customer: 'Noah Rodriguez', date: '2023-10-26', amount: '$99.90', status: 'Cancelled' },
        { id: '#3028', customer: 'Ava Martinez', date: '2023-10-25', amount: '$540.75', status: 'Shipped' }
    ];

    const displayOrders = orders.length > 0 ? orders : mockOrders;

    const getStatusBadge = (status) => {
        const colors = {
            'Shipped': 'bg-green-100 text-green-700',
            'Pending': 'bg-yellow-100 text-yellow-700',
            'Cancelled': 'bg-red-100 text-red-700',
            'Processing': 'bg-blue-100 text-blue-700'
        };
        return colors[status] || 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Recent Orders</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {displayOrders.map((order, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.id}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.customer}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.date}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.amount}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(order.status)}`}>
                                        {order.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
