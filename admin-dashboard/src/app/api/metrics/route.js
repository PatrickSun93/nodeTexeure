import { NextResponse } from 'next/server';

// Metrics endpoint for monitoring and observability
export async function GET() {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      application: {
        name: 'admin-dashboard',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
      },
      system: {
        memory: getMemoryMetrics(),
        cpu: getCpuMetrics(),
        nodejs: getNodeJsMetrics()
      },
      performance: {
        responseTime: getResponseTimeMetrics(),
        requests: getRequestMetrics(),
        errors: getErrorMetrics()
      }
    };

    return NextResponse.json(metrics, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Metrics collection failed:', error);
    
    return NextResponse.json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Memory metrics
function getMemoryMetrics() {
  const memUsage = process.memoryUsage();
  
  return {
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    rss: memUsage.rss,
    heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
    heapUsagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
  };
}

// CPU metrics (basic)
function getCpuMetrics() {
  const cpuUsage = process.cpuUsage();
  
  return {
    user: cpuUsage.user,
    system: cpuUsage.system,
    userMS: Math.round(cpuUsage.user / 1000),
    systemMS: Math.round(cpuUsage.system / 1000)
  };
}

// Node.js specific metrics
function getNodeJsMetrics() {
  return {
    version: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    ppid: process.ppid,
    title: process.title
  };
}

// Response time metrics (placeholder)
function getResponseTimeMetrics() {
  // In a real implementation, you would track these metrics
  // using a monitoring library or custom middleware
  return {
    average: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    note: 'Response time tracking not implemented'
  };
}

// Request metrics (placeholder)
function getRequestMetrics() {
  // In a real implementation, you would track these metrics
  return {
    total: 0,
    success: 0,
    errors: 0,
    rate: 0,
    note: 'Request tracking not implemented'
  };
}

// Error metrics (placeholder)
function getErrorMetrics() {
  // In a real implementation, you would track error rates
  return {
    total: 0,
    rate: 0,
    lastError: null,
    note: 'Error tracking not implemented'
  };
}

// Prometheus-style metrics endpoint
// Internal helper (not a route export — Next only allows GET/POST/etc. as route handlers)
async function GET_PROMETHEUS() {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const prometheusMetrics = `
# HELP nodejs_heap_size_used_bytes Process heap space size used
# TYPE nodejs_heap_size_used_bytes gauge
nodejs_heap_size_used_bytes ${memUsage.heapUsed}

# HELP nodejs_heap_size_total_bytes Process heap space size total
# TYPE nodejs_heap_size_total_bytes gauge
nodejs_heap_size_total_bytes ${memUsage.heapTotal}

# HELP nodejs_external_memory_bytes Nodejs external memory size in bytes
# TYPE nodejs_external_memory_bytes gauge
nodejs_external_memory_bytes ${memUsage.external}

# HELP process_resident_memory_bytes Resident memory size in bytes
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes ${memUsage.rss}

# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total ${cpuUsage.user / 1000000}

# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds
# TYPE process_cpu_system_seconds_total counter
process_cpu_system_seconds_total ${cpuUsage.system / 1000000}

# HELP nodejs_version_info Node.js version info
# TYPE nodejs_version_info gauge
nodejs_version_info{version="${process.version}"} 1

# HELP process_start_time_seconds Start time of the process since unix epoch in seconds
# TYPE process_start_time_seconds gauge
process_start_time_seconds ${Math.floor(Date.now() / 1000 - process.uptime())}
    `.trim();

    return new Response(prometheusMetrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    return new Response('# Error collecting metrics\n', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

// Handle other HTTP methods
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}