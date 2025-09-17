'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home, Mail } from 'lucide-react';

/**
 * Enhanced Error Boundary Component
 * Provides user-friendly error handling with recovery options
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Report error to backend
    this.reportError(error, errorInfo);
  }

  /**
   * Report error to backend for monitoring
   */
  reportError = async (error, errorInfo) => {
    try {
      await fetch('/api/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name
          },
          context: {
            componentStack: errorInfo.componentStack,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            retryCount: this.state.retryCount
          }
        })
      });
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    }
  };

  /**
   * Retry the failed component
   */
  handleRetry = async () => {
    this.setState({ isRetrying: true });

    // Add a small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 1000));

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.state.retryCount + 1,
      isRetrying: false
    });
  };

  /**
   * Navigate to home page
   */
  handleGoHome = () => {
    window.location.href = '/';
  };

  /**
   * Contact support
   */
  handleContactSupport = () => {
    const subject = encodeURIComponent('Error Report - Need Help');
    const body = encodeURIComponent(`
I encountered an error on your website:

Error: ${this.state.error?.message || 'Unknown error'}
Page: ${window.location.href}
Time: ${new Date().toISOString()}

Please help me resolve this issue.
    `);
    
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
  };

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage() {
    const error = this.state.error;
    
    if (!error) return 'Something went wrong';

    // Check for specific error types
    if (error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')) {
      return 'The page failed to load properly. This usually happens after an update.';
    }
    
    if (error.message.includes('Network Error') || error.message.includes('fetch')) {
      return 'Unable to connect to our servers. Please check your internet connection.';
    }
    
    if (error.message.includes('permission') || error.message.includes('unauthorized')) {
      return 'You don\'t have permission to access this content.';
    }

    return 'An unexpected error occurred. We\'re working to fix this issue.';
  }

  /**
   * Get recovery suggestions based on error type
   */
  getRecoverySuggestions() {
    const error = this.state.error;
    
    if (!error) return [];

    if (error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')) {
      return [
        'Refresh the page',
        'Clear your browser cache',
        'Try using an incognito/private window'
      ];
    }
    
    if (error.message.includes('Network Error') || error.message.includes('fetch')) {
      return [
        'Check your internet connection',
        'Try again in a few moments',
        'Disable any ad blockers or VPN'
      ];
    }

    return [
      'Refresh the page',
      'Try again later',
      'Contact support if the problem persists'
    ];
  }

  render() {
    if (this.state.hasError) {
      const userMessage = this.getUserFriendlyMessage();
      const suggestions = this.getRecoverySuggestions();
      const showRetry = this.state.retryCount < 3;

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            {/* Error Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            {/* Error Title */}
            <h1 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Oops! Something went wrong
            </h1>

            {/* User-friendly message */}
            <p className="text-gray-600 text-center mb-6">
              {userMessage}
            </p>

            {/* Recovery suggestions */}
            {suggestions.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  Try these solutions:
                </h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  {suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3">
              {showRetry && (
                <button
                  onClick={this.handleRetry}
                  disabled={this.state.isRetrying}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {this.state.isRetrying ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </>
                  )}
                </button>
              )}

              <button
                onClick={this.handleGoHome}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 flex items-center justify-center"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Homepage
              </button>

              <button
                onClick={this.handleContactSupport}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 flex items-center justify-center"
              >
                <Mail className="w-4 h-4 mr-2" />
                Contact Support
              </button>
            </div>

            {/* Error details (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 p-3 bg-gray-100 rounded text-xs">
                <summary className="cursor-pointer font-medium text-gray-700 mb-2">
                  Technical Details (Development)
                </summary>
                <div className="space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  <div>
                    <strong>Stack:</strong>
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                      {this.state.error.stack}
                    </pre>
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;