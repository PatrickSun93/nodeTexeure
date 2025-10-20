'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Navigation items configuration
const navigationItems = [
  {
    name: 'Dashboard',
    href: '/',
    icon: '📊',
    description: 'Overview and analytics'
  },
  {
    name: 'Products',
    href: '/products',
    icon: '📦',
    description: 'Product management',
    children: [
      { name: 'All Products', href: '/products' },
      { name: 'Product Approval', href: '/products/approval' },
      { name: 'Add Product', href: '/products/new' }
    ]
  },
  {
    name: 'Orders',
    href: '/orders',
    icon: '🛒',
    description: 'Order management',
    children: [
      { name: 'All Orders', href: '/orders' },
      { name: 'Order Details', href: '/orders/details' }
    ]
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: '👥',
    description: 'Customer management',
    children: [
      { name: 'All Customers', href: '/customers' },
      { name: 'Customer Support', href: '/customers/support' }
    ]
  },
  {
    name: 'Inventory',
    href: '/inventory',
    icon: '📋',
    description: 'Stock management',
    children: [
      { name: 'Stock Management', href: '/inventory/stock-management' },
      { name: 'Purchase Orders', href: '/inventory/purchase-orders' },
      { name: 'Suppliers', href: '/inventory/suppliers' }
    ]
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: '📈',
    description: 'Analytics and reports',
    children: [
      { name: 'Financial Reports', href: '/reports' },
      { name: 'Payment Analytics', href: '/reports/payment-analytics' },
      { name: 'Tax Analytics', href: '/reports/tax-analytics' },
      { name: 'Scheduled Reports', href: '/reports/scheduled' }
    ]
  },
  {
    name: 'Content',
    href: '/content',
    icon: '📝',
    description: 'Content management',
    children: [
      { name: 'Pages', href: '/content/pages' },
      { name: 'Media Library', href: '/content/media' },
      { name: 'Menus', href: '/content/menus' },
      { name: 'Banners', href: '/content/banners' },
      { name: 'SEO Settings', href: '/content/seo' }
    ]
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: '⚙️',
    description: 'System configuration',
    children: [
      { name: 'General Settings', href: '/settings' },
      { name: 'Email Templates', href: '/email-templates' },
      { name: 'User Management', href: '/users' }
    ]
  },
  {
    name: 'Security',
    href: '/security',
    icon: '🔒',
    description: 'Security and audit',
    children: [
      { name: 'Security Overview', href: '/security' },
      { name: 'Audit Logs', href: '/security/audit' },
      { name: 'Backup Management', href: '/security/backup' }
    ]
  }
];

// Navigation Item Component
function NavigationItem({ item, isActive, isExpanded, onToggle, level = 0 }) {
  const router = useRouter();
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = (e) => {
    if (hasChildren) {
      e.preventDefault();
      onToggle();
    } else {
      router.push(item.href);
    }
  };

  const itemClasses = `
    flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors
    ${level === 0 ? 'font-medium' : 'font-normal ml-4'}
    ${isActive 
      ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-500' 
      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
    }
  `;

  return (
    <div>
      <button
        onClick={handleClick}
        className={itemClasses}
        title={item.description}
      >
        {level === 0 && (
          <span className="mr-3 text-base">{item.icon}</span>
        )}
        <span className="flex-1 text-left">{item.name}</span>
        {hasChildren && (
          <span className={`ml-2 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        )}
      </button>
      
      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1">
          {item.children.map((child) => (
            <NavigationItem
              key={child.href}
              item={child}
              isActive={child.href === usePathname()}
              level={level + 1}
              onToggle={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Main Navigation Component
export default function Navigation({ isCollapsed, onToggleCollapse }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [expandedItems, setExpandedItems] = useState(new Set());

  const toggleExpanded = (itemName) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemName)) {
      newExpanded.delete(itemName);
    } else {
      newExpanded.add(itemName);
    }
    setExpandedItems(newExpanded);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login?logout=true');
  };

  const isItemActive = (item) => {
    if (item.href === pathname) return true;
    if (item.children) {
      return item.children.some(child => child.href === pathname);
    }
    return false;
  };

  return (
    <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!isCollapsed && (
          <div className="flex items-center">
            <h1 className="text-lg font-semibold text-gray-900">Admin Panel</h1>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="text-gray-500">
            {isCollapsed ? '▶' : '◀'}
          </span>
        </button>
      </div>

      {/* User Info */}
      {!isCollapsed && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {user?.firstName?.charAt(0) || 'A'}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500">{user?.role || 'Admin'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigationItems.map((item) => (
          <NavigationItem
            key={item.name}
            item={item}
            isActive={isItemActive(item)}
            isExpanded={expandedItems.has(item.name)}
            onToggle={() => toggleExpanded(item.name)}
          />
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200">
        {!isCollapsed ? (
          <div className="space-y-2">
            <button
              onClick={() => router.push('/settings')}
              className="flex items-center w-full px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
            >
              <span className="mr-3">⚙️</span>
              Settings
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-3 py-2 text-sm text-red-600 rounded-md hover:bg-red-50 transition-colors"
            >
              <span className="mr-3">🚪</span>
              Logout
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => router.push('/settings')}
              className="w-full p-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              className="w-full p-2 text-red-600 rounded-md hover:bg-red-50 transition-colors"
              title="Logout"
            >
              🚪
            </button>
          </div>
        )}
      </div>
    </div>
  );
}