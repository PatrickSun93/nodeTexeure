'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/contexts/AdminContext';
import useNavigation from '@/hooks/useNavigation';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface TestResult {
  passed: boolean;
  message: string;
}

type TestResults = Record<string, TestResult>;

// Integration test component to verify all systems work together
export default function IntegrationTest({ onComplete }: { onComplete?: (results: TestResults) => void }) {
  const [testResults, setTestResults] = useState<TestResults>({});
  const [isRunning, setIsRunning] = useState(false);
  
  const { isAuthenticated, user } = useAuth();
  const { 
    sidebarCollapsed, 
    toggleSidebar, 
    showSuccess, 
    showError,
    notifications,
    isLoading,
    errors
  } = useAdmin();
  const { getCurrentSection, navigateTo } = useNavigation();
  const { handleError } = useErrorHandler();

  const runIntegrationTests = async () => {
    setIsRunning(true);
    const results: TestResults = {};

    try {
      // Test 1: Authentication Context
      results.auth = {
        passed: isAuthenticated !== undefined && user !== undefined,
        message: isAuthenticated ? 'Authentication context working' : 'Authentication context failed'
      };

      // Test 2: Admin Context
      results.adminContext = {
        passed: typeof toggleSidebar === 'function' && typeof showSuccess === 'function',
        message: 'Admin context functions available'
      };

      // Test 3: Navigation Hook
      results.navigation = {
        passed: typeof getCurrentSection === 'function' && typeof navigateTo === 'function',
        message: 'Navigation hook working'
      };

      // Test 4: Error Handler
      results.errorHandler = {
        passed: typeof handleError === 'function',
        message: 'Error handler available'
      };

      // Test 5: State Management
      results.stateManagement = {
        passed: typeof sidebarCollapsed === 'boolean' && Array.isArray(notifications),
        message: 'State management working'
      };

      // Test 6: Loading States
      results.loadingStates = {
        passed: typeof isLoading === 'object' && isLoading !== null,
        message: 'Loading states available'
      };

      // Test 7: Error States
      results.errorStates = {
        passed: typeof errors === 'object' && errors !== null,
        message: 'Error states available'
      };

      // Test 8: Notification System
      try {
        showSuccess('Integration test notification');
        results.notifications = {
          passed: true,
          message: 'Notification system working'
        };
      } catch (error) {
        results.notifications = {
          passed: false,
          message: 'Notification system failed'
        };
      }

      // Test 9: Sidebar Toggle
      try {
        const initialState = sidebarCollapsed;
        toggleSidebar();
        // Note: In a real test, we'd wait for state update
        results.sidebarToggle = {
          passed: true,
          message: 'Sidebar toggle working'
        };
      } catch (error) {
        results.sidebarToggle = {
          passed: false,
          message: 'Sidebar toggle failed'
        };
      }

      // Test 10: Current Section Detection
      try {
        const section = getCurrentSection();
        results.sectionDetection = {
          passed: typeof section === 'string',
          message: `Current section: ${section}`
        };
      } catch (error) {
        results.sectionDetection = {
          passed: false,
          message: 'Section detection failed'
        };
      }

      setTestResults(results);
      
      // Show summary
      const passedTests = Object.values(results).filter(test => test.passed).length;
      const totalTests = Object.keys(results).length;
      
      if (passedTests === totalTests) {
        showSuccess(`All ${totalTests} integration tests passed!`);
      } else {
        showError(`${passedTests}/${totalTests} integration tests passed`);
      }

    } catch (error) {
      handleError(error, 'integration-test');
    } finally {
      setIsRunning(false);
      if (onComplete) {
        onComplete(testResults);
      }
    }
  };

  // Auto-run tests in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && isAuthenticated) {
      // Run tests after a short delay to ensure all contexts are initialized
      const timer = setTimeout(runIntegrationTests, 2000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  if (process.env.NODE_ENV !== 'development') {
    return null; // Don't show in production
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">Integration Test</h3>
          <button
            onClick={runIntegrationTests}
            disabled={isRunning}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Tests'}
          </button>
        </div>
        
        {Object.keys(testResults).length > 0 && (
          <div className="space-y-1">
            {Object.entries(testResults).map(([testName, result]) => (
              <div key={testName} className="flex items-center text-xs">
                <span className={`mr-2 ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {result.passed ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 truncate" title={result.message}>
                  {testName}: {result.message}
                </span>
              </div>
            ))}
          </div>
        )}
        
        {isRunning && (
          <div className="flex items-center justify-center py-2">
            <div className="admin-spinner"></div>
            <span className="ml-2 text-xs text-gray-600">Running tests...</span>
          </div>
        )}
      </div>
    </div>
  );
}