#!/bin/bash

# NodeTexture Development Startup Script
# This script starts frontend, backend, and admin dashboard servers

echo "🚀 Starting NodeTexture Development Environment..."
echo ""

# Function to kill process on a specific port
function kill_port() {
  PORT=$1
  PID=$(lsof -ti :$PORT)
  if [ ! -z "$PID" ]; then
    echo "Killing process on port $PORT (PID: $PID)"
    kill $PID
  fi
}

# Kill existing processes on ports
kill_port 3000
kill_port 6666
kill_port 3005

sleep 2  # Give time for processes to terminate

# Function to cleanup background processes on exit
cleanup() {
    echo "\n🛑 Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID $ADMIN_PID 2>/dev/null
    exit
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Start backend server
echo "📡 Starting backend server on port 6666..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend server
echo "🎨 Starting frontend server on port 3000..."
npm run dev &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 3

# Start admin dashboard
echo "🛡️ Starting admin dashboard on port 3005..."
cd admin-dashboard
npm run dev &
ADMIN_PID=$!
cd ..

echo ""
echo "✅ Development environment started!"
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend:  http://localhost:6666"
echo "📡 API:      http://localhost:6666/api"
echo "🛡️ Admin:   http://localhost:3005"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for all processes
wait $BACKEND_PID $FRONTEND_PID $ADMIN_PID