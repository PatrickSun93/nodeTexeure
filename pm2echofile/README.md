# PM2 Development Environment

This directory contains PM2 ecosystem configuration files for managing the nodeTexture application in development environment.

## Files Overview

- `ecosystem.config.js` - General PM2 configuration
- `ecosystem.dev.config.js` - Development-specific PM2 configuration
- `pm2-dev.sh` - Convenient script for managing development environment
- `logs/` - Directory for PM2 application logs

## Prerequisites

Make sure PM2 is installed globally:
```bash
npm install -g pm2
```

## Quick Start

### Using the PM2 Development Script (Recommended)

```bash
# Start the development environment
./pm2echofile/pm2-dev.sh start

# Check status
./pm2echofile/pm2-dev.sh status

# View logs
./pm2echofile/pm2-dev.sh logs

# Stop the environment
./pm2echofile/pm2-dev.sh stop
```

### Using PM2 Directly

```bash
# Start both frontend and backend
pm2 start pm2echofile/ecosystem.dev.config.js

# Check status
pm2 status

# View logs
pm2 logs

# Stop applications
pm2 stop nodeTexture-frontend-dev nodeTexture-backend-dev

# Restart applications
pm2 restart nodeTexture-frontend-dev nodeTexture-backend-dev

# Delete processes
pm2 delete nodeTexture-frontend-dev nodeTexture-backend-dev
```

## Application Details

### Frontend (nodeTexture-frontend-dev)
- **Port**: 3000 (or 3001 if 3000 is in use)
- **Script**: `npm run dev`
- **Features**: Next.js development server with hot reload
- **Logs**: `pm2echofile/logs/frontend-dev-*.log`

### Backend (nodeTexture-backend-dev)
- **Port**: 5000
- **Script**: `server.js`
- **Features**: File watching enabled for auto-restart on changes
- **Watched directories**: `routes/`, `services/`, `utils/`, `middleware/`
- **Logs**: `pm2echofile/logs/backend-dev-*.log`

## PM2 Development Script Commands

| Command | Description |
|---------|-------------|
| `start` | Start the development environment |
| `stop` | Stop the development environment |
| `restart` | Restart the development environment |
| `status` | Show application status |
| `logs` | Show logs (add `frontend` or `backend` for specific logs) |
| `delete` | Delete PM2 processes |
| `monitor` | Open PM2 monitor interface |

### Examples

```bash
# View only frontend logs
./pm2echofile/pm2-dev.sh logs frontend

# View only backend logs
./pm2echofile/pm2-dev.sh logs backend

# Open PM2 monitor
./pm2echofile/pm2-dev.sh monitor
```

## Log Files

Logs are stored in `pm2echofile/logs/` directory:

- `frontend-dev-error.log` - Frontend error logs
- `frontend-dev-out.log` - Frontend output logs
- `frontend-dev-combined.log` - Combined frontend logs
- `backend-dev-error.log` - Backend error logs
- `backend-dev-out.log` - Backend output logs
- `backend-dev-combined.log` - Combined backend logs

## Environment Variables

Both applications run with:
- `NODE_ENV=development`
- Frontend: `PORT=3000`
- Backend: `PORT=5000`

## Memory Management

- Frontend: Max 1GB memory before restart
- Backend: Max 512MB memory before restart

## File Watching

- **Frontend**: PM2 watching disabled (Next.js handles hot reload)
- **Backend**: PM2 watching enabled for development files

## Troubleshooting

### Port Already in Use
If port 3000 is in use, Next.js will automatically use port 3001.

### PM2 Not Found
Install PM2 globally: `npm install -g pm2`

### Permission Denied
Make sure the script is executable: `chmod +x pm2echofile/pm2-dev.sh`

### Applications Not Starting
1. Check if dependencies are installed: `npm install`
2. Check backend dependencies: `cd backend && npm install`
3. Verify database connection and environment variables

### Viewing Real-time Logs
```bash
# All logs
pm2 logs --lines 50

# Specific application
pm2 logs nodeTexture-frontend-dev --lines 50
```

## Production Deployment

For production deployment, use `ecosystem.config.js` with appropriate environment variables and clustering configuration.

## Additional PM2 Commands

```bash
# Save PM2 process list
pm2 save

# Resurrect saved processes
pm2 resurrect

# Enable startup script
pm2 startup

# Disable startup script
pm2 unstartup
```