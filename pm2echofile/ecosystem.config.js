module.exports = {
  apps: [
    {
      name: 'nodeTexture-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: '/Volumes/externalssd/devitems/nodeTexeure',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      error_file: './pm2echofile/logs/frontend-error.log',
      out_file: './pm2echofile/logs/frontend-out.log',
      log_file: './pm2echofile/logs/frontend-combined.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'nodeTexture-backend',
      script: 'npm',
      args: 'run start',
      cwd: '/Volumes/externalssd/devitems/nodeTexeure/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      error_file: '../pm2echofile/logs/backend-error.log',
      out_file: '../pm2echofile/logs/backend-out.log',
      log_file: '../pm2echofile/logs/backend-combined.log',
      time: true,
      merge_logs: true
    }
  ],

  deploy: {
    development: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:repo.git',
      path: '/var/www/development',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env development',
      'pre-setup': ''
    }
  }
};