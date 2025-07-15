# Backend Utilities

This directory contains utility functions and helpers used across the backend application.

## 📁 File Structure

```
backend/utils/
├── responseFormatter.js  # Standardized API response formatting
└── README.md            # This documentation
```

## 🔧 Response Formatter (`responseFormatter.js`)

The `ResponseFormatter` utility provides a standardized way to format API responses across the entire backend application.

### 📋 Standard Response Format

All API responses follow this consistent structure:

```javascript
{
  "status": "SUCCESS" | "FAIL" | "CUSTOM_STATUS",
  "message": "Optional descriptive message",
  "keyValueTable": [
    { "key1": [] },
  ]
}
```

### 🎯 Key Benefits

1. **Consistency** - All endpoints return the same format
2. **Predictability** - Frontend can handle responses uniformly
3. **Flexibility** - keyValueTable can contain any data structure
4. **Extensibility** - Easy to add new fields or modify existing ones
5. **Type Safety** - Clear status indicators for success/failure

### 🚀 Usage Examples

#### Basic Success Response
```javascript
const ResponseFormatter = require('../utils/responseFormatter');

// Simple success with message only
const response = ResponseFormatter.success('Operation completed successfully');
// Result: { status: 'SUCCESS', message: 'Operation completed successfully' }
```

#### Success with Data
```javascript
// Success with data in keyValueTable
const keyValueTable = [
  { 'userId': 123 },
  { 'username': 'john_doe' },
  { 'email': 'john@example.com' }
];

const response = ResponseFormatter.success('User retrieved successfully', keyValueTable);
// Result: {
//   status: 'SUCCESS',
//   message: 'User retrieved successfully',
//   keyValueTable: [
//     { 'userId': 123 },
//     { 'username': 'john_doe' },
//     { 'email': 'john@example.com' }
//   ]
// }
```



#### Error Response
```javascript
// Failure response with error details
const errorDetails = [
  { 'errorCode': 'VALIDATION_ERROR' },
  { 'field': 'email' },
  { 'reason': 'Invalid email format' }
];

const response = ResponseFormatter.failure('Validation failed', errorDetails);
// Result: {
//   status: 'FAIL',
//   message: 'Validation failed',
//   keyValueTable: [
//     { 'errorCode': 'VALIDATION_ERROR' },
//     { 'field': 'email' },
//     { 'reason': 'Invalid email format' }
//   ]
// }
```

#### Manual Key-Value Creation
```javascript
// Create keyValueTable format manually
const userData = {
  id: 123,
  name: 'John Doe',
  email: 'john@example.com',
  active: true
};

// Create key-value pairs manually for better control
const keyValueTable = [
  { 'id': userData.id },
  { 'name': userData.name },
  { 'email': userData.email },
  { 'active': userData.active }
];

const response = ResponseFormatter.success('User data', keyValueTable);
```

### 🔄 Converting Back to Object
```javascript
// Convert keyValueTable back to object format
const keyValueTable = [
  { 'id': 123 },
  { 'name': 'John Doe' },
  { 'email': 'john@example.com' }
];

const userData = ResponseFormatter.keyValueTableToObject(keyValueTable);
// Result: {
//   id: 123,
//   name: 'John Doe',
//   email: 'john@example.com'
// }
```

### 📚 API Reference

#### `ResponseFormatter.success(message, keyValueTable)`
- **message** (string, optional): Success message
- **keyValueTable** (array, optional): Data in key-value format
- **Returns**: Formatted success response object

#### `ResponseFormatter.failure(message, keyValueTable)`
- **message** (string, optional): Error message
- **keyValueTable** (array, optional): Error details in key-value format
- **Returns**: Formatted failure response object

#### `ResponseFormatter.custom(status, message, keyValueTable)`
- **status** (string): Custom status value
- **message** (string, optional): Message
- **keyValueTable** (array, optional): Data in key-value format
- **Returns**: Formatted response object with custom status

#### `ResponseFormatter.keyValueTableToObject(keyValueTable)`
- **keyValueTable** (array): Key-value table to convert
- **Returns**: Converted object

### 🏗️ Integration in Services

#### Before (Inconsistent Format)
```javascript
// Different services returning different formats
class UserService {
  getUser(id) {
    return {
      user: { id, name: 'John' },
      success: true
    };
  }
}

class StatusService {
  getHealth() {
    return {
      status: 'OK',
      message: 'Server running',
      timestamp: new Date().toISOString()
    };
  }
}
```

#### After (Consistent Format)
```javascript
const ResponseFormatter = require('../utils/responseFormatter');

class UserService {
  getUser(id) {
    const keyValueTable = [
      { 'id': id },
      { 'name': 'John' },
      { 'email': 'john@example.com' }
    ];
    
    return ResponseFormatter.success('User retrieved successfully', keyValueTable);
  }
}

class StatusService {
  getHealth() {
    const keyValueTable = [
      { 'port': process.env.PORT || 6666 }
    ];
    
    return ResponseFormatter.success('Server running', keyValueTable);
  }
}
```

### 🧪 Testing

```javascript
// Example test for ResponseFormatter
const ResponseFormatter = require('../utils/responseFormatter');

describe('ResponseFormatter', () => {
  test('creates success response', () => {
    const response = ResponseFormatter.success('Test message', [{ 'key': 'value' }]);
    
    expect(response.status).toBe('SUCCESS');
    expect(response.message).toBe('Test message');
    expect(response.keyValueTable).toEqual([{ 'key': 'value' }]);
  });
  
  test('creates failure response', () => {
    const response = ResponseFormatter.failure('Error message');
    
    expect(response.status).toBe('FAIL');
    expect(response.message).toBe('Error message');
  });
  

});
```

### 🔮 Future Enhancements

1. **Validation** - Add schema validation for keyValueTable
2. **Compression** - Optimize keyValueTable for large datasets
3. **Versioning** - Support multiple response format versions
4. **Metadata** - Add response metadata (pagination, etc.)
5. **Localization** - Support internationalized messages

---

**This standardized format ensures consistency across all API endpoints and makes frontend integration much more predictable and maintainable.**