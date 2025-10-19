#!/bin/bash

# Production Deployment Script
set -e

echo "🚀 Starting production deployment..."

# Check if required files exist
if [ ! -f "deployment/.env.production" ]; then
    echo "❌ Error: deployment/.env.production file not found"
    echo "Please copy deployment/.env.production.template and configure your values"
    exit 1
fi

# Load environment variables
export $(cat deployment/.env.production | xargs)

# Pre-deployment checks
echo "🔍 Running pre-deployment checks..."

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    exit 1
fi

# Check required environment variables
required_vars=("DB_PASSWORD" "STRIPE_SECRET_KEY" "JWT_SECRET" "ENCRYPTION_KEY")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: Required environment variable $var is not set"
        exit 1
    fi
done

# Run integration tests
echo "🧪 Running integration tests..."
if ! npm run test:integration; then
    echo "❌ Error: Integration tests failed"
    exit 1
fi

# Build and deploy
echo "🏗️ Building and deploying containers..."

# Stop existing containers
docker-compose -f deployment/docker-compose.prod.yml down

# Build new images
docker-compose -f deployment/docker-compose.prod.yml build --no-cache

# Start services
docker-compose -f deployment/docker-compose.prod.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Health checks
echo "🏥 Running health checks..."

# Check backend health
if ! curl -f http://localhost:6666/api/health; then
    echo "❌ Error: Backend health check failed"
    exit 1
fi

# Check frontend
if ! curl -f http://localhost:3000; then
    echo "❌ Error: Frontend health check failed"
    exit 1
fi

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose -f deployment/docker-compose.prod.yml exec backend npm run migrate

# Warm up caches
echo "🔥 Warming up caches..."
curl -s http://localhost:6666/api/products > /dev/null
curl -s http://localhost:3000 > /dev/null

echo "✅ Deployment completed successfully!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔌 API: http://localhost:6666"

# Show running containers
echo "📊 Running containers:"
docker-compose -f deployment/docker-compose.prod.yml ps