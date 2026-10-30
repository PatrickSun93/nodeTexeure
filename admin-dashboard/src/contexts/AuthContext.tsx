'use client';

import { createContext, useContext, useReducer, useEffect, type ComponentType, type ReactNode } from 'react';
import { adminAuth } from '@/lib/api';
import { apiFetch } from '@/utils/api';
import type { AuthUser, LoginResult, SessionInfo } from '@/types/api';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOGIN_SUCCESS'; payload: AuthUser }
  | { type: 'LOGOUT' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'UPDATE_USER'; payload: Partial<AuthUser> };

type Outcome = { success: true } | { success: false; error: string };

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<Outcome>;
  logout: () => Promise<void>;
  updateProfile: (profileData: Record<string, unknown>) => Promise<Outcome>;
  clearError: () => void;
  checkAuthStatus: () => Promise<void>;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Auth state
const initialState: AuthState = {
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
} as const;

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
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
        user: { ...state.user, ...action.payload } as AuthUser,
      };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext<AuthContextValue | null>(null);

// Auth provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      
      const response = await adminAuth.verify<SessionInfo>();

      if (response.status === 'SUCCESS' && response.keyValueTable && response.keyValueTable.authenticated) {
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

  const login = async (email: string, password: string): Promise<Outcome> => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

      const response = await adminAuth.login<LoginResult>(email, password);

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
        payload: errorMessage(error),
      });
      return { success: false, error: errorMessage(error) };
    }
  };

  const logout = async () => {
    try {
      // Admin writes (incl. logout) must go through the CSRF-aware apiFetch and hit the
      // real backend route: POST /api/admin/logout (there is no /admin/auth/logout).
      await apiFetch('/api/admin/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with logout even if API call fails
    } finally {
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  };

  const updateProfile = async (profileData: Record<string, unknown>): Promise<Outcome> => {
    try {
      const response = await adminAuth.updateProfile(profileData);

      // Backend envelope uses status: 'SUCCESS' (not success: true).
      if (response.status === 'SUCCESS') {
        // Refresh user data
        await checkAuthStatus();
        return { success: true };
      } else {
        throw new Error(response.message || 'Profile update failed');
      }
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  };

  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  // Context value
  const value: AuthContextValue = {
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
export function withAuth<P extends object>(Component: ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
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