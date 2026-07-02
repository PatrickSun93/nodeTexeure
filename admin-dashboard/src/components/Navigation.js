'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/contexts/AdminContext';
import LanguageSwitcher from './LanguageSwitcher';

// Navigation items configuration. Labels/descriptions are keyed into the AdminNav
// message namespace (items.* / desc.*) so the sidebar localizes.
const navigationItems = [
  { key: 'dashboard', href: '/', icon: '📊', hasDesc: true },
  {
    key: 'products', href: '/products', icon: '📦', hasDesc: true,
    children: [
      { key: 'allProducts', href: '/products' },
      { key: 'productApproval', href: '/products/approval' },
      { key: 'addProduct', href: '/products/new' }
    ]
  },
  {
    key: 'orders', href: '/orders', icon: '🛒', hasDesc: true,
    children: [
      { key: 'allOrders', href: '/orders' },
      { key: 'orderDetails', href: '/orders/details' }
    ]
  },
  {
    key: 'customers', href: '/customers', icon: '👥', hasDesc: true,
    children: [
      { key: 'allCustomers', href: '/customers' },
      { key: 'customerSupport', href: '/customers/support' }
    ]
  },
  {
    key: 'inventory', href: '/inventory', icon: '📋', hasDesc: true,
    children: [
      { key: 'stockManagement', href: '/inventory/stock-management' },
      { key: 'purchaseOrders', href: '/inventory/purchase-orders' },
      { key: 'suppliers', href: '/inventory/suppliers' }
    ]
  },
  {
    key: 'reports', href: '/reports', icon: '📈', hasDesc: true,
    children: [
      { key: 'financialReports', href: '/reports' },
      { key: 'paymentAnalytics', href: '/reports/payment-analytics' },
      { key: 'taxAnalytics', href: '/reports/tax-analytics' },
      { key: 'scheduledReports', href: '/reports/scheduled' }
    ]
  },
  {
    key: 'content', href: '/content', icon: '📝', hasDesc: true,
    children: [
      { key: 'pages', href: '/content/pages' },
      { key: 'mediaLibrary', href: '/content/media' },
      { key: 'menus', href: '/content/menus' },
      { key: 'banners', href: '/content/banners' },
      { key: 'seoSettings', href: '/content/seo' }
    ]
  },
  {
    key: 'settingsNav', href: '/settings', icon: '⚙️', hasDesc: true,
    children: [
      { key: 'generalSettings', href: '/settings' },
      { key: 'emailTemplates', href: '/email-templates' },
      { key: 'userManagement', href: '/users' }
    ]
  },
  {
    key: 'security', href: '/security', icon: '🔒', hasDesc: true,
    children: [
      { key: 'securityOverview', href: '/security' },
      { key: 'auditLogs', href: '/security/audit' },
      { key: 'backupManagement', href: '/security/backup' }
    ]
  }
];

// Navigation Item Component
function NavigationItem({ item, isActive, isExpanded, onToggle, level = 0, alertCount = 0 }) {
  const router = useRouter();
  const t = useTranslations('AdminNav');
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
    flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors relative
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
        title={item.hasDesc ? t(`desc.${item.key}`) : undefined}
      >
        {level === 0 && (
          <span className="mr-3 text-base">{item.icon}</span>
        )}
        <span className="flex-1 text-left">{t(`items.${item.key}`)}</span>
        
        {/* Alert Badge */}
        {alertCount > 0 && (
          <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
            {alertCount > 99 ? '99+' : alertCount}
          </span>
        )}
        
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
  const { 
    showSuccess, 
    showError,
    inventoryAlerts,
    notifications 
  } = useAdmin();
  const router = useRouter();
  const t = useTranslations('AdminNav');
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
    try {
      await logout();
      showSuccess(t('logoutSuccess'));
      router.push('/login?logout=true');
    } catch (error) {
      showError(t('logoutFailed'));
      // Force logout anyway
      router.push('/login?logout=true');
    }
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
            <h1 className="text-lg font-semibold text-gray-900">{t('adminPanel')}</h1>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          title={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
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
              <p className="text-xs text-gray-500">{user?.role || t('roleAdmin')}</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <LanguageSwitcher />
          </div>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigationItems.map((item) => {
          // Calculate alert counts for specific sections
          let alertCount = 0;
          if (item.key === 'inventory' && inventoryAlerts) {
            alertCount = inventoryAlerts.length;
          }

          return (
            <NavigationItem
              key={item.key}
              item={item}
              isActive={isItemActive(item)}
              isExpanded={expandedItems.has(item.key)}
              onToggle={() => toggleExpanded(item.key)}
              alertCount={alertCount}
            />
          );
        })}
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
              {t('settings')}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-3 py-2 text-sm text-red-600 rounded-md hover:bg-red-50 transition-colors"
            >
              <span className="mr-3">🚪</span>
              {t('logout')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => router.push('/settings')}
              className="w-full p-2 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
              title={t('settings')}
            >
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              className="w-full p-2 text-red-600 rounded-md hover:bg-red-50 transition-colors"
              title={t('logout')}
            >
              🚪
            </button>
          </div>
        )}
      </div>
    </div>
  );
}