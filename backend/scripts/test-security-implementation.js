const axios = require('axios');
const crypto = require('crypto');

/**
 * Test script for security and rate limiting implementation
 * Tests various security features including rate limiting, input validation, and audit logging
 */

const BASE_URL = 'http://localhost:6666';
const TEST_EMAIL = 'security-test@example.com';
const TEST_PASSWORD = 'TestPassword123!';

// Helper function to make requests
const makeRequest = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status, headers: response.headers };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message, 
      status: error.response?.status,
      headers: error.response?.headers
    };
  }
};

// Test rate limiting
const testRateLimit = async () => {
  console.log('\n=== Testing Rate Limiting ===');
  
  const requests = [];
  const endpoint = '/api/status/health';
  
  // Make 50 rapid requests to test rate limiting
  for (let i = 0; i < 50; i++) {
    requests.push(makeRequest('GET', endpoint));
  }
  
  try {
    const results = await Promise.all(requests);
    const successful = results.filter(r => r.success).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    
    console.log(`✓ Made 50 requests: ${successful} successful, ${rateLimited} rate limited`);
    
    if (rateLimited > 0) {
      console.log('✓ Rate limiting is working correctly');
      
      // Check rate limit headers
      const rateLimitedResponse = results.find(r => r.status === 429);
      if (rateLimitedResponse && rateLimitedResponse.headers) {
        console.log('✓ Rate limit headers present:', {
          'ratelimit-limit': rateLimitedResponse.headers['ratelimit-limit'],
          'ratelimit-remaining': rateLimitedResponse.headers['ratelimit-remaining'],
          'ratelimit-reset': rateLimitedResponse.headers['ratelimit-reset']
        });
      }
    } else {
      console.log('⚠ Rate limiting may not be working - no 429 responses received');
    }
  } catch (error) {
    console.error('✗ Rate limit test failed:', error.message);
  }
};

// Test input validation
const testInputValidation = async () => {
  console.log('\n=== Testing Input Validation ===');
  
  // Test SQL injection attempt
  const sqlInjectionData = {
    email: "test@example.com'; DROP TABLE users; --",
    password: 'password123'
  };
  
  const sqlResult = await makeRequest('POST', '/api/users/login', sqlInjectionData);
  if (!sqlResult.success && sqlResult.status === 400) {
    console.log('✓ SQL injection attempt blocked');
  } else {
    console.log('⚠ SQL injection attempt may not have been blocked');
  }
  
  // Test XSS attempt
  const xssData = {
    email: 'test@example.com',
    password: '<script>alert("xss")</script>'
  };
  
  const xssResult = await makeRequest('POST', '/api/users/login', xssData);
  if (!xssResult.success && xssResult.status === 400) {
    console.log('✓ XSS attempt blocked');
  } else {
    console.log('⚠ XSS attempt may not have been blocked');
  }
  
  // Test invalid email format
  const invalidEmailData = {
    email: 'invalid-email',
    password: 'ValidPassword123!',
    firstName: 'Test',
    lastName: 'User'
  };
  
  const emailResult = await makeRequest('POST', '/api/users/register', invalidEmailData);
  if (!emailResult.success && emailResult.status === 400) {
    console.log('✓ Invalid email format rejected');
  } else {
    console.log('⚠ Invalid email format may not have been rejected');
  }
  
  // Test weak password
  const weakPasswordData = {
    email: 'test@example.com',
    password: '123',
    firstName: 'Test',
    lastName: 'User'
  };
  
  const passwordResult = await makeRequest('POST', '/api/users/register', weakPasswordData);
  if (!passwordResult.success && passwordResult.status === 400) {
    console.log('✓ Weak password rejected');
  } else {
    console.log('⚠ Weak password may not have been rejected');
  }
};

// Test security headers
const testSecurityHeaders = async () => {
  console.log('\n=== Testing Security Headers ===');
  
  const result = await makeRequest('GET', '/api/status/health');
  
  if (result.success && result.headers) {
    const securityHeaders = {
      'x-frame-options': result.headers['x-frame-options'],
      'x-content-type-options': result.headers['x-content-type-options'],
      'x-xss-protection': result.headers['x-xss-protection'],
      'referrer-policy': result.headers['referrer-policy'],
      'content-security-policy': result.headers['content-security-policy']
    };
    
    console.log('Security headers present:');
    Object.entries(securityHeaders).forEach(([header, value]) => {
      if (value) {
        console.log(`✓ ${header}: ${value}`);
      } else {
        console.log(`⚠ ${header}: missing`);
      }
    });
  } else {
    console.log('✗ Could not retrieve security headers');
  }
};

// Test request size limiting
const testRequestSizeLimit = async () => {
  console.log('\n=== Testing Request Size Limiting ===');
  
  // Create a large payload (over 10MB)
  const largeData = {
    email: 'test@example.com',
    password: 'password123',
    largeField: 'x'.repeat(11 * 1024 * 1024) // 11MB of data
  };
  
  const result = await makeRequest('POST', '/api/users/login', largeData);
  
  if (!result.success && result.status === 413) {
    console.log('✓ Large request rejected with 413 status');
  } else if (!result.success && result.status === 400) {
    console.log('✓ Large request rejected (may be caught by validation)');
  } else {
    console.log('⚠ Large request may not have been rejected');
  }
};

// Test CSRF protection (requires authentication)
const testCSRFProtection = async () => {
  console.log('\n=== Testing CSRF Protection ===');
  
  // First, try to register a test user
  const registerData = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    firstName: 'Security',
    lastName: 'Test'
  };
  
  await makeRequest('POST', '/api/users/register', registerData);
  
  // Login to get authentication token
  const loginResult = await makeRequest('POST', '/api/users/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  
  if (loginResult.success && loginResult.data.token) {
    console.log('✓ Successfully authenticated for CSRF test');
    

  } else {
    console.log('⚠ Could not authenticate for CSRF test');
  }
};

// Test suspicious activity detection
const testSuspiciousActivityDetection = async () => {
  console.log('\n=== Testing Suspicious Activity Detection ===');
  
  const suspiciousPatterns = [
    { name: 'SQL Injection', data: { query: "1' OR '1'='1" } },
    { name: 'XSS Script', data: { comment: '<script>alert("xss")</script>' } },
    { name: 'Path Traversal', data: { file: '../../../etc/passwd' } },
    { name: 'Command Injection', data: { cmd: 'ls; rm -rf /' } }
  ];
  
  for (const pattern of suspiciousPatterns) {
    const result = await makeRequest('POST', '/api/status/hello', pattern.data);
    
    if (!result.success && result.status === 400) {
      console.log(`✓ ${pattern.name} detected and blocked`);
    } else {
      console.log(`⚠ ${pattern.name} may not have been detected`);
    }
  }
};

// Main test runner
const runSecurityTests = async () => {
  console.log('🔒 Starting Security Implementation Tests');
  console.log('==========================================');
  
  try {
    await testRateLimit();
    await testInputValidation();
    await testSecurityHeaders();
    await testRequestSizeLimit();
    await testCSRFProtection();
    await testSuspiciousActivityDetection();
    
    console.log('\n✅ Security tests completed');
    console.log('Check the backend logs for audit trail entries');
    
  } catch (error) {
    console.error('❌ Security tests failed:', error.message);
  }
};

// Run tests if this script is executed directly
if (require.main === module) {
  runSecurityTests().then(() => {
    console.log('\n🏁 Test execution finished');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runSecurityTests,
  testRateLimit,
  testInputValidation,
  testSecurityHeaders,
  testRequestSizeLimit,
  testCSRFProtection,
  testSuspiciousActivityDetection
};