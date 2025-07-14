# Backend Routes

This directory contains the routing layer of the backend application, organized by functionality to improve code structure and maintainability.

## Routes Overview

### Status Routes

**File:** `statusRoutes.js`

**Base Path:** `/api/status`

**Endpoints:**
- `GET /api/status/health` - Server health check
- `GET /api/status/hello` - Basic hello message
- `POST /api/status/hello` - Personalized hello message

**Features:**
- Proper error handling with try-catch blocks
- Consistent response format
- Integration with StatusService

## Route Structure

Each route file follows this pattern:

```javascript
const express = require('express');
const serviceModule = require('../services/serviceModule');

const router = express.Router();

// Route definitions with proper error handling
router.get('/endpoint', (req, res) => {
  try {
    const result = serviceModule.method();
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Error message',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
```

## Backward Compatibility

The main `server.js` file includes redirect routes for backward compatibility:

- `/api/health` → `/api/status/health` (301 redirect)
- `/api/hello` → `/api/status/hello` (301/307 redirect)

This ensures existing clients continue to work while encouraging migration to the new structure.

## Adding New Routes

To add a new route module:

1. Create a new file in the `routes/` directory (e.g., `userRoutes.js`)
2. Define your routes using Express Router
3. Import the corresponding service
4. Add proper error handling
5. Register the routes in `server.js`

**Example:**
```javascript
// routes/userRoutes.js
const express = require('express');
const userService = require('../services/userService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const users = userService.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
```

**Register in server.js:**
```javascript
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);
```

## Best Practices

- Use Express Router for modular route definitions
- Implement consistent error handling
- Keep routes thin - delegate business logic to services
- Use appropriate HTTP status codes
- Include timestamps in responses
- Validate input parameters
- Use middleware for common functionality
- Document API endpoints clearly