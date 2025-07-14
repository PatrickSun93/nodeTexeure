#!/bin/bash

# Test script for the logging system
# This script demonstrates various API calls to test the logging functionality

echo "🧪 Testing Logging System"
echo "========================"

BASE_URL="http://localhost:6666"

echo "\n1. Testing Health Check (GET request)"
curl -X GET "$BASE_URL/api/status/health" \
  -H "x-session-id: session_123" \
  -H "x-user-id: user_456"

echo "\n\n2. Testing Hello API (POST request with body)"
curl -X POST "$BASE_URL/api/status/hello" \
  -H "Content-Type: application/json" \
  -H "x-session-id: session_789" \
  -H "x-user-id: user_101" \
  -d '{"name":"LoggingTestUser"}'

echo "\n\n3. Testing Users List (GET request)"
curl -X GET "$BASE_URL/api/users" \
  -H "x-session-id: session_abc" \
  -H "x-user-id: user_xyz"

echo "\n\n4. Testing User Creation (POST request with data)"
curl -X POST "$BASE_URL/api/users" \
  -H "Content-Type: application/json" \
  -H "x-session-id: session_def" \
  -H "x-user-id: user_admin" \
  -d '{"name":"Test Logger","email":"logger@test.com"}'

echo "\n\n5. Testing Non-existent Endpoint (404 error)"
curl -X GET "$BASE_URL/api/nonexistent" \
  -H "x-session-id: session_error" \
  -H "x-user-id: user_test"

echo "\n\n6. Testing Invalid JSON (400 error)"
curl -X POST "$BASE_URL/api/users" \
  -H "Content-Type: application/json" \
  -H "x-session-id: session_invalid" \
  -d '{invalid json}'

echo "\n\n✅ Logging test completed!"
echo "📁 Check the log file at: logs/$(date +%Y-%m-%d).txt"
echo "\n📊 Log file contents:"
echo "==================="
tail -20 "logs/$(date +%Y-%m-%d).txt"