import { NextResponse } from 'next/server';

// Health check endpoint for monitoring
export async function GET() {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      checks: {
        memory: getMemoryUsage(),
        api: await checkApiConnection(),
        database: await checkDatabaseConnection()
      }
    };

    // Determine overall health status
    const allChecksHealthy = Object.values(healthData.checks).every(
      check => check.status === 'healthy'
    );

    if (!allChecksHealthy) {
      return NextResponse.json(healthData, { status: 503 });
    }

    return NextResponse.json(healthData, { status: 200 });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    }, { status: 503 });
  }
}

// Check memory usage
function getMemoryUsage() {
  try {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    return {
      status: memoryUsagePercent < 90 ? 'healthy' : 'warning',
      heapUsed: Math.round(usedMemory / 1024 / 1024), // MB
      heapTotal: Math.round(totalMemory / 1024 / 1024), // MB
      usagePercent: Math.round(memoryUsagePercent)
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

// Check API connection
async function checkApiConnection() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6666';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${apiUrl}/api/health`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Admin-Dashboard-Health-Check'
      }
    });

    clearTimeout(timeoutId);

    return {
      status: response.ok ? 'healthy' : 'unhealthy',
      responseTime: response.headers.get('x-response-time') || 'unknown',
      statusCode: response.status
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        status: 'timeout',
        error: 'API connection timeout'
      };
    }
    
    return {
      status: 'error',
      error: error.message
    };
  }
}

// Check database connection (placeholder)
async function checkDatabaseConnection() {
  try {
    // This would typically check the database connection
    // For now, we'll just return a healthy status
    // In a real implementation, you would:
    // 1. Import your database connection
    // 2. Execute a simple query like SELECT 1
    // 3. Return the result
    
    return {
      status: 'healthy',
      message: 'Database connection check not implemented'
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

// Handle other HTTP methods
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}