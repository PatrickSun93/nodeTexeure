'use client';

import { createContext, useContext, useReducer, useEffect } from 'react';
import { useAuth } from './AuthContext';

// Notification ids must be unique even when two toasts fire in the same
// millisecond (Date.now() alone gave duplicate React keys and removed both).
let notificationSeq = 0;
const nextNotificationId = () => `${Date.now()}-${++notificationSeq}`;

// Initial admin state
const initialState = {
  // UI State
  sidebarCollapsed: false,
  theme: 'light',
  notifications: [],
  
  // Data Cache
  dashboardData: null,
  inventoryAlerts: [],
  recentActivity: [],
  
  // Loading States
  isLoading: {
    dashboard: false,
    products: false,
    orders: false,
    customers: false,
    inventory: false,
    reports: false
  },
  
  // Error States
  errors: {},
  
  // Settings
  settings: {
    autoRefresh: true,
    refreshInterval: 300000, // 5 minutes
    dateFormat: 'MM/DD/YYYY',
    timezone: 'America/New_York',
    itemsPerPage: 25
  },
  
  // Filters and Search
  filters: {
    products: {},
    orders: {},
    customers: {},
    inventory: {}
  },
  
  // Selected Items (for bulk operations)
  selectedItems: {
    products: [],
    orders: [],
    customers: []
  }
};

// Action types
const ADMIN_ACTIONS = {
  // UI Actions
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  SET_THEME: 'SET_THEME',
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_NOTIFICATIONS: 'CLEAR_NOTIFICATIONS',
  
  // Data Actions
  SET_DASHBOARD_DATA: 'SET_DASHBOARD_DATA',
  SET_INVENTORY_ALERTS: 'SET_INVENTORY_ALERTS',
  SET_RECENT_ACTIVITY: 'SET_RECENT_ACTIVITY',
  
  // Loading Actions
  SET_LOADING: 'SET_LOADING',
  
  // Error Actions
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  CLEAR_ALL_ERRORS: 'CLEAR_ALL_ERRORS',
  
  // Settings Actions
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  
  // Filter Actions
  SET_FILTER: 'SET_FILTER',
  CLEAR_FILTERS: 'CLEAR_FILTERS',
  
  // Selection Actions
  SET_SELECTED_ITEMS: 'SET_SELECTED_ITEMS',
  ADD_SELECTED_ITEM: 'ADD_SELECTED_ITEM',
  REMOVE_SELECTED_ITEM: 'REMOVE_SELECTED_ITEM',
  CLEAR_SELECTED_ITEMS: 'CLEAR_SELECTED_ITEMS',
  
  // Reset
  RESET_STATE: 'RESET_STATE'
};

// Reducer function
function adminReducer(state, action) {
  switch (action.type) {
    case ADMIN_ACTIONS.TOGGLE_SIDEBAR:
      return {
        ...state,
        sidebarCollapsed: !state.sidebarCollapsed
      };
      
    case ADMIN_ACTIONS.SET_THEME:
      return {
        ...state,
        theme: action.payload
      };
      
    case ADMIN_ACTIONS.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: [...state.notifications, {
          id: nextNotificationId(),
          timestamp: new Date(),
          ...action.payload
        }]
      };
      
    case ADMIN_ACTIONS.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload)
      };
      
    case ADMIN_ACTIONS.CLEAR_NOTIFICATIONS:
      return {
        ...state,
        notifications: []
      };
      
    case ADMIN_ACTIONS.SET_DASHBOARD_DATA:
      return {
        ...state,
        dashboardData: action.payload
      };
      
    case ADMIN_ACTIONS.SET_INVENTORY_ALERTS:
      return {
        ...state,
        inventoryAlerts: action.payload
      };
      
    case ADMIN_ACTIONS.SET_RECENT_ACTIVITY:
      return {
        ...state,
        recentActivity: action.payload
      };
      
    case ADMIN_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: {
          ...state.isLoading,
          [action.payload.section]: action.payload.loading
        }
      };
      
    case ADMIN_ACTIONS.SET_ERROR:
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload.section]: action.payload.error
        }
      };
      
    case ADMIN_ACTIONS.CLEAR_ERROR:
      const newErrors = { ...state.errors };
      delete newErrors[action.payload];
      return {
        ...state,
        errors: newErrors
      };
      
    case ADMIN_ACTIONS.CLEAR_ALL_ERRORS:
      return {
        ...state,
        errors: {}
      };
      
    case ADMIN_ACTIONS.UPDATE_SETTINGS:
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload
        }
      };
      
    case ADMIN_ACTIONS.SET_FILTER:
      return {
        ...state,
        filters: {
          ...state.filters,
          [action.payload.section]: {
            ...state.filters[action.payload.section],
            ...action.payload.filters
          }
        }
      };
      
    case ADMIN_ACTIONS.CLEAR_FILTERS:
      return {
        ...state,
        filters: {
          ...state.filters,
          [action.payload]: {}
        }
      };
      
    case ADMIN_ACTIONS.SET_SELECTED_ITEMS:
      return {
        ...state,
        selectedItems: {
          ...state.selectedItems,
          [action.payload.section]: action.payload.items
        }
      };
      
    case ADMIN_ACTIONS.ADD_SELECTED_ITEM:
      return {
        ...state,
        selectedItems: {
          ...state.selectedItems,
          [action.payload.section]: [
            ...state.selectedItems[action.payload.section],
            action.payload.item
          ]
        }
      };
      
    case ADMIN_ACTIONS.REMOVE_SELECTED_ITEM:
      return {
        ...state,
        selectedItems: {
          ...state.selectedItems,
          [action.payload.section]: state.selectedItems[action.payload.section].filter(
            item => item !== action.payload.item
          )
        }
      };
      
    case ADMIN_ACTIONS.CLEAR_SELECTED_ITEMS:
      return {
        ...state,
        selectedItems: {
          ...state.selectedItems,
          [action.payload]: []
        }
      };
      
    case ADMIN_ACTIONS.RESET_STATE:
      return initialState;
      
    default:
      return state;
  }
}

// Create context
const AdminContext = createContext();

// Admin provider component
export function AdminProvider({ children }) {
  const [state, dispatch] = useReducer(adminReducer, initialState);
  const { isAuthenticated } = useAuth();

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem('adminSettings');
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          dispatch({
            type: ADMIN_ACTIONS.UPDATE_SETTINGS,
            payload: settings
          });
        } catch (error) {
          console.error('Failed to load admin settings:', error);
        }
      }
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('adminSettings', JSON.stringify(state.settings));
    }
  }, [state.settings]);

  // Reset state on logout
  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: ADMIN_ACTIONS.RESET_STATE });
    }
  }, [isAuthenticated]);

  // Action creators
  const actions = {
    // UI Actions
    toggleSidebar: () => dispatch({ type: ADMIN_ACTIONS.TOGGLE_SIDEBAR }),
    
    setTheme: (theme) => dispatch({ 
      type: ADMIN_ACTIONS.SET_THEME, 
      payload: theme 
    }),
    
    addNotification: (notification) => dispatch({
      type: ADMIN_ACTIONS.ADD_NOTIFICATION,
      payload: notification
    }),
    
    removeNotification: (id) => dispatch({
      type: ADMIN_ACTIONS.REMOVE_NOTIFICATION,
      payload: id
    }),
    
    clearNotifications: () => dispatch({ type: ADMIN_ACTIONS.CLEAR_NOTIFICATIONS }),
    
    // Data Actions
    setDashboardData: (data) => dispatch({
      type: ADMIN_ACTIONS.SET_DASHBOARD_DATA,
      payload: data
    }),
    
    setInventoryAlerts: (alerts) => dispatch({
      type: ADMIN_ACTIONS.SET_INVENTORY_ALERTS,
      payload: alerts
    }),
    
    setRecentActivity: (activity) => dispatch({
      type: ADMIN_ACTIONS.SET_RECENT_ACTIVITY,
      payload: activity
    }),
    
    // Loading Actions
    setLoading: (section, loading) => dispatch({
      type: ADMIN_ACTIONS.SET_LOADING,
      payload: { section, loading }
    }),
    
    // Error Actions
    setError: (section, error) => dispatch({
      type: ADMIN_ACTIONS.SET_ERROR,
      payload: { section, error }
    }),
    
    clearError: (section) => dispatch({
      type: ADMIN_ACTIONS.CLEAR_ERROR,
      payload: section
    }),
    
    clearAllErrors: () => dispatch({ type: ADMIN_ACTIONS.CLEAR_ALL_ERRORS }),
    
    // Settings Actions
    updateSettings: (settings) => dispatch({
      type: ADMIN_ACTIONS.UPDATE_SETTINGS,
      payload: settings
    }),
    
    // Filter Actions
    setFilter: (section, filters) => dispatch({
      type: ADMIN_ACTIONS.SET_FILTER,
      payload: { section, filters }
    }),
    
    clearFilters: (section) => dispatch({
      type: ADMIN_ACTIONS.CLEAR_FILTERS,
      payload: section
    }),
    
    // Selection Actions
    setSelectedItems: (section, items) => dispatch({
      type: ADMIN_ACTIONS.SET_SELECTED_ITEMS,
      payload: { section, items }
    }),
    
    addSelectedItem: (section, item) => dispatch({
      type: ADMIN_ACTIONS.ADD_SELECTED_ITEM,
      payload: { section, item }
    }),
    
    removeSelectedItem: (section, item) => dispatch({
      type: ADMIN_ACTIONS.REMOVE_SELECTED_ITEM,
      payload: { section, item }
    }),
    
    clearSelectedItems: (section) => dispatch({
      type: ADMIN_ACTIONS.CLEAR_SELECTED_ITEMS,
      payload: section
    }),
    
    // Utility Actions
    showNotification: (message, type = 'info', duration = 5000) => {
      const id = nextNotificationId();
      dispatch({
        type: ADMIN_ACTIONS.ADD_NOTIFICATION,
        payload: { id, message, type, duration }
      });
      
      // Auto-remove notification after duration
      if (duration > 0) {
        setTimeout(() => {
          dispatch({
            type: ADMIN_ACTIONS.REMOVE_NOTIFICATION,
            payload: id
          });
        }, duration);
      }
      
      return id;
    },
    
    showSuccess: (message, duration = 3000) => {
      return actions.showNotification(message, 'success', duration);
    },
    
    showError: (message, duration = 5000) => {
      return actions.showNotification(message, 'error', duration);
    },
    
    showWarning: (message, duration = 4000) => {
      return actions.showNotification(message, 'warning', duration);
    }
  };

  // Context value
  const value = {
    ...state,
    ...actions
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

// Custom hook to use admin context
export function useAdmin() {
  const context = useContext(AdminContext);
  
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  
  return context;
}

export default AdminContext;