module.exports = {
  apps: [
    {
      name: 'nodeTexture-frontend-prod',
      script: 'npm',
      args: 'start',
      cwd: '/Volumes/externalssd/devitems/nodeTexeure',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './pm2echofile/logs/frontend-prod-error.log',
      out_file: './pm2echofile/logs/frontend-prod-out.log',
      log_file: './pm2echofile/logs/frontend-prod-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'nodeTexture-backend-prod',
      script: 'server.js',
      cwd: '/Volumes/externalssd/devitems/nodeTexeure/backend',
      instances: 2, // Run 2 instances for load balancing
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: '../pm2echofile/logs/backend-prod-error.log',
      out_file: '../pm2echofile/logs/backend-prod-out.log',
      log_file: '../pm2echofile/logs/backend-prod-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 3000,
      // Health check
      health_check_grace_period: 3000,
      // Log rotation
      log_type: 'json',
      // Performance monitoring
      pmx: true,
      // Source map support
      source_map_support: true
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: ['production-server-1', 'production-server-2'],
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/nodeTexture.git',
      path: '/var/www/nodeTexture',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.prod.config.js --env production',
      'pre-setup': 'apt-get update && apt-get install -y git nodejs npm'
    },
    staging: {
      user: 'deploy',
      host: 'staging-server',
      ref: 'origin/develop',
      repo: 'git@github.com:your-repo/nodeTexture.git',
      path: '/var/www/nodeTexture-staging',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.prod.config.js --env staging',
      'pre-setup': 'apt-get update && apt-get install -y git nodejs npm'
    }
  }
};