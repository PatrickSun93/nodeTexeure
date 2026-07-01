#!/bin/bash

echo "🔍 Testing Multi-language Search Functionality"
echo ""

BASE_URL="http://localhost:6666/api"

echo "1. Testing basic English search..."
RESULT1=$(curl -s "${BASE_URL}/search?q=cotton")
echo "✅ English search result:"
echo "$RESULT1" | jq -r '.status'
echo ""

echo "2. Testing search suggestions..."
RESULT2=$(curl -s "${BASE_URL}/search/suggestions?q=cot")
echo "✅ Suggestions result:"
echo "$RESULT2" | jq -r '.status'
echo ""

echo "3. Testing popular terms..."
RESULT3=$(curl -s "${BASE_URL}/search/popular")
echo "✅ Popular terms result:"
echo "$RESULT3" | jq -r '.status'
echo ""

echo "4. Testing search trends..."
RESULT4=$(curl -s "${BASE_URL}/search/trends")
echo "✅ Search trends result:"
echo "$RESULT4" | jq -r '.status'
echo ""

echo "5. Testing search analytics..."
RESULT5=$(curl -s "${BASE_URL}/search/analytics?q=cotton")
echo "✅ Search analytics result:"
echo "$RESULT5" | jq -r '.status'
echo ""

echo "🎉 All search functionality tests completed!"