import { NextResponse } from 'next/server';

type CheckStatus = 'healthy' | 'unhealthy' | 'warning' | 'error' | 'timeout' | 'unknown';

interface Check {
  status: CheckStatus;
  [detail: string]: unknown;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

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

    // Determine overall health honestly:
    //  - hard failure (unhealthy/error/timeout) => 503 "unhealthy"
    //  - a non-measurable check (unknown/warning) => 200 "degraded" (surfaced, not faked)
    //  - otherwise => 200 "healthy"
    const checkStatuses = Object.values(healthData.checks).map(check => check.status);
    const hasFailure = checkStatuses.some(s => ['unhealthy', 'error', 'timeout'].includes(s));
    const hasDegraded = checkStatuses.some(s => ['unknown', 'warning'].includes(s));
    healthData.status = hasFailure ? 'unhealthy' : (hasDegraded ? 'degraded' : 'healthy');

    return NextResponse.json(healthData, { status: hasFailure ? 503 : 200 });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: errorMessage(error)
    }, { status: 503 });
  }
}

// Check memory usage
function getMemoryUsage(): Check {
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
      error: errorMessage(error)
    };
  }
}

// Check API connection
async function checkApiConnection(): Promise<Check> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6666';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    // Hit the backend's canonical health route directly (/api/health 301-redirects here).
    const response = await fetch(`${apiUrl}/api/status/health`, {
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
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'timeout',
        error: 'API connection timeout'
      };
    }
    
    return {
      status: 'error',
      error: errorMessage(error)
    };
  }
}

// Check database connection.
// The admin dashboard tier has NO direct database connection — MySQL is owned by the
// backend API. We cannot truthfully assert DB health from here, so we report "unknown"
// (surfaced as degraded, non-fatal) rather than a fabricated "healthy". The backend is
// the source of truth for DB status (see backend /api/status/health).
async function checkDatabaseConnection(): Promise<Check> {
  return {
    status: 'unknown',
    measured: false,
    message: 'Database is owned by the backend API and is not directly reachable from the admin dashboard; not checked here.'
  };
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