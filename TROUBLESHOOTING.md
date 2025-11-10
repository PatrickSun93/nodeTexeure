# Troubleshooting Guide

## Currency Error: "useCurrency must be used within a CurrencyProvider"

### Problem
You may encounter this error even after deleting currency-related files:
```
Error: useCurrency must be used within a CurrencyProvider
    at useCurrency (webpack-internal:///(app-pages-browser)/./src/contexts/CurrencyContext.js:290:15)
```

### Root Cause
- Next.js and webpack cache old compiled modules
- Even after deleting files, cached references remain in:
  - `.next/` directory
  - `node_modules/.cache/`
  - `.swc/` directory
  - Browser cache

### Permanent Solution

#### Method 1: Use the Clean Script (Recommended)
We've added npm scripts to handle this:

```bash
# Stop services, clear all caches, and restart automatically
npm run clean:full

# Or just clear caches (if services aren't running)
npm run clean

# Then restart manually if needed
npm run dev:full
```

#### Method 2: Manual Cleanup
If you prefer manual control:

```bash
# Stop all services
npm run pm2:stop

# Clear all caches
rm -rf .next node_modules/.cache .swc

# Restart services
npm run dev:full
```

#### Method 3: Clear Browser Cache
Sometimes browser cache also holds stale code:

1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

Or in Chrome/Edge:
- Open DevTools
- Go to Application tab
- Click "Clear storage"
- Click "Clear site data"

### Prevention Tips

1. **Always clear cache after:**
   - Deleting components or contexts
   - Major refactoring
   - Changing module imports/exports
   - Upgrading Next.js or React

2. **Use the clean script regularly:**
   ```bash
   npm run clean:full
   ```

3. **If errors persist:**
   ```bash
   # Nuclear option - reinstall node_modules
   rm -rf node_modules .next
   npm install
   npm run dev:full
   ```

### Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run clean` | Clear Next.js and webpack caches |
| `npm run clean:full` | Stop services + clear caches + restart |
| `npm run dev:full` | Start full development environment |
| `npm run pm2:dev` | Start PM2-managed services only |
| `npm run pm2:restart` | Restart running PM2 services |
| `npm run pm2:stop` | Stop all PM2 services |

### Why This Happens

Next.js uses aggressive caching for performance:
- **Webpack cache**: Speeds up rebuilds
- **SWC cache**: Faster transpilation
- **.next cache**: Compiled pages and components

When you delete files that are imported elsewhere, these caches may still reference the old code, causing "module not found" or "must be used within Provider" errors.

### Additional Notes

- The build process (`npm run build`) automatically uses fresh compilation
- Development mode (`npm run dev`) uses caching for speed
- PM2 persistent processes may hold onto old code
- Browser cache can also cause issues in development

### Related Issues

If you see similar errors with other contexts or providers:
1. Run one command: `npm run clean:full`
2. Or manually:
   - Stop services: `npm run pm2:stop`
   - Clear caches: `npm run clean`
   - Restart: `npm run dev:full`
3. Clear browser cache (Ctrl+Shift+Delete)

This should resolve 99% of caching issues!

