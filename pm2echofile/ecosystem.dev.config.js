module.exports = {
  apps: [
    {
      name: 'nodeTexture-frontend-dev',
      script: 'npm',
      args: 'run dev',
      cwd: '/Volumes/externalssd/devitems/nodeTexeure',
      instances: 1,
      autorestart: true,
      watch: false, // Disable PM2 watch since Next.js has its own hot reload
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      error_file: './pm2echofile/logs/frontend-dev-error.log',
      out_file: './pm2echofile/logs/frontend-dev-out.log',
      log_file: './pm2echofile/logs/frontend-dev-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'nodeTexture-backend-dev',
      script: 'server.js',
      cwd: '/Volumes/externalssd/devitems/nodeTexeure/backend',
      instances: 1,
      autorestart: true,
      watch: [
        'server.js',
        'routes/',
        'services/',
        'utils/',
        'middleware/'
      ],
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log'
      ],
      watch_options: {
        followSymlinks: false,
        usePolling: false
      },
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      error_file: '../pm2echofile/logs/backend-dev-error.log',
      out_file: '../pm2echofile/logs/backend-dev-out.log',
      log_file: '../pm2echofile/logs/backend-dev-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 3000
    }
  ]
};