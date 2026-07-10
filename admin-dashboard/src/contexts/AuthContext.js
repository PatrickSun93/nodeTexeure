'use client';

import { createContext, useContext, useReducer, useEffect } from 'react';
import { adminAuth, isAuthError } from '@/lib/api';

// Auth state
const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Auth actions
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  UPDATE_USER: 'UPDATE_USER',
};

// Auth reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };
    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext();

// Auth provider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      
      const response = await adminAuth.verify();

      if (response.status === 'SUCCESS' && response.keyValueTable) {
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: response.keyValueTable,
        });
      } else {
        dispatch({ type: AUTH_ACTIONS.LOGOUT });
      }
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  };

  const login = async (email, password) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const response = await adminAuth.login(email, password);

      // Backend envelope uses status: 'SUCCESS' (not success: true).
      if (response.status === 'SUCCESS' && response.keyValueTable) {
        // Allow both admins and staff into the dashboard. Staff have isAdmin=false
        // (so admin-only routes and UI stay gated) but isStaff=true. The dispatched
        // payload carries role + isAdmin + isStaff for downstream gating.
        const { isAdmin, isStaff } = response.keyValueTable;
        if (!isAdmin && !isStaff) {
          throw new Error('Access denied. Staff or admin privileges required.');
        }
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: response.keyValueTable,
        });
        return { success: true };
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error) {
      dispatch({
        type: AUTH_ACTIONS.SET_ERROR,
        payload: error.message,
      });
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await adminAuth.logout();
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with logout even if API call fails
    } finally {
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await adminAuth.updateProfile(profileData);
      
      if (response.success) {
        // Refresh user data
        await checkAuthStatus();
        return { success: true };
      } else {
        throw new Error(response.message || 'Profile update failed');
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  // Context value
  const value = {
    ...state,
    login,
    logout,
    updateProfile,
    clearError,
    checkAuthStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

// HOC for protected routes
export function withAuth(Component) {
  return function AuthenticatedComponent(props) {
    const { isAuthenticated, isLoading } = useAuth();
    
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="admin-spinner"></div>
          <span className="ml-2">Loading...</span>
        </div>
      );
    }
    
    if (!isAuthenticated) {
      // This will be handled by the individual pages
      return null;
    }
    
    return <Component {...props} />;
  };
}

export default AuthContext;