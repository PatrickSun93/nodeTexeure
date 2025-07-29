# Backend Services

This directory contains the service layer of the backend application, organized by functionality to improve code maintainability and separation of concerns.

## Services Overview

### StatusService

**File:** `statusService.js`

**Purpose:** Handles all status-related operations including health checks and hello endpoints.

**Methods:**
- `getHealthStatus()` - Returns server health information
- `getHelloMessage()` - Returns a basic hello message
- `getPersonalizedHello(name)` - Returns a personalized hello message

**Usage Example:**
```javascript
const statusService = require('./services/statusService');

// Get health status
const health = statusService.getHealthStatus();

// Get hello message
const hello = statusService.getHelloMessage();

// Get personalized hello
const personalHello = statusService.getPersonalizedHello('John');
```

## Architecture Benefits

1. **Separation of Concerns:** Business logic is separated from routing logic
2. **Reusability:** Services can be easily reused across different routes
3. **Testability:** Services can be unit tested independently
4. **Maintainability:** Code is organized and easier to maintain
5. **Scalability:** Easy to add new services and extend functionality

## Adding New Services

To add a new service:

1. Create a new file in the `services/` directory (e.g., `userService.js`)
2. Implement your service class with appropriate methods
3. Export an instance of the service
4. Import and use in your route handlers

**Example:**
```javascript
// services/userService.js
class UserService {
  getAllUsers() {
    // Implementation
  }
  
  createUser(userData) {
    // Implementation
  }
}

module.exports = new UserService();
```

## Best Practices

- Keep services focused on a single responsibility
- Use descriptive method names
- Include proper error handling
- Add JSDoc comments for better documentation
- Return consistent data structures
- Avoid direct database access in routes (use services instead)