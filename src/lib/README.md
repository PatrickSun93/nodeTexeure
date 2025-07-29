# Shared Utilities Library

This directory contains reusable utilities, hooks, constants, and API functions that can be shared across multiple components and pages in the application.

## 📁 File Structure

```
src/lib/
├── api.js          # API utility functions and endpoints
├── constants.js    # Application constants and configuration
├── hooks.js        # Custom React hooks
├── utils.js        # General utility functions
├── index.js        # Main export file
└── README.md       # This documentation
```

## 🚀 Quick Start

### Import Everything
```javascript
import {
  // API functions
  userAPI,
  checkBackendHealth,
  testHelloAPI,
  
  // Custom hooks
  useUsers,
  useBackendHealth,
  useForm,
  useMessage,
  
  // Utilities
  validateUserData,
  confirmAction,
  formatErrorMessage,
  
  // Constants
  CSS_CLASSES,
  MESSAGES,
  API_ENDPOINTS,
} from '../lib';
```

### Import Specific Modules
```javascript
import { userAPI } from '../lib/api';
import { useUsers } from '../lib/hooks';
import { CSS_CLASSES } from '../lib/constants';
import { validateUserData } from '../lib/utils';
```

## 📚 API Functions (`api.js`)

### Core API Functions

#### `apiRequest(endpoint, options)`
Generic API request function with error handling.

```javascript
import { apiRequest } from '../lib/api';

const data = await apiRequest('/users', {
  method: 'POST',
  body: JSON.stringify({ name: 'John', email: 'john@example.com' })
});
```

#### `checkBackendHealth()`
Check backend server health status.

```javascript
import { checkBackendHealth } from '../lib/api';

const healthData = await checkBackendHealth();
console.log(healthData.message);
```

### User API (`userAPI`)

```javascript
import { userAPI } from '../lib/api';

// Get all users
const users = await userAPI.getAll();

// Create user
const newUser = await userAPI.create({ name: 'John', email: 'john@example.com' });

// Get user by ID
const user = await userAPI.getById(123);

// Update user
const updatedUser = await userAPI.update(123, { name: 'Jane' });

// Delete user
await userAPI.delete(123);
```

## 🎣 Custom Hooks (`hooks.js`)

### `useBackendHealth()`
Manage backend health status.

```javascript
import { useBackendHealth } from '../lib/hooks';

function MyComponent() {
  const { status, isConnected, loading, checkHealth } = useBackendHealth();
  
  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={checkHealth} disabled={loading}>
        Check Health
      </button>
    </div>
  );
}
```

### `useUsers()`
Manage users data and CRUD operations.

```javascript
import { useUsers } from '../lib/hooks';

function UsersList() {
  const { users, loading, createUser, deleteUser } = useUsers();
  
  const handleCreate = async () => {
    const result = await createUser({ name: 'John', email: 'john@example.com' });
    if (result.success) {
      console.log('User created!');
    }
  };
  
  return (
    <div>
      {loading ? 'Loading...' : users.map(user => (
        <div key={user.id}>
          {user.name}
          <button onClick={() => deleteUser(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

### `useForm(initialValues, validationFn)`
Manage form state with validation.

```javascript
import { useForm, validateUserData } from '../lib';

function UserForm() {
  const {
    values,
    errors,
    handleChange,
    handleBlur,
    handleSubmit,
    reset
  } = useForm(
    { name: '', email: '' },
    validateUserData
  );
  
  const onSubmit = async (userData) => {
    // Handle form submission
    return { success: true };
  };
  
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit(onSubmit);
    }}>
      <input
        name="name"
        value={values.name}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {errors.name && <span>{errors.name}</span>}
    </form>
  );
}
```

### `useMessage()`
Manage application messages and notifications.

```javascript
import { useMessage } from '../lib/hooks';

function MyComponent() {
  const { message, messageType, showSuccess, showError } = useMessage();
  
  const handleAction = async () => {
    try {
      // Some action
      showSuccess('Action completed successfully!');
    } catch (error) {
      showError('Action failed!');
    }
  };
  
  return (
    <div>
      {message && <div className={`alert-${messageType}`}>{message}</div>}
      <button onClick={handleAction}>Do Something</button>
    </div>
  );
}
```

## 🛠️ Utility Functions (`utils.js`)

### Validation

```javascript
import { validateUserData, isValidEmail } from '../lib/utils';

const userData = { name: 'John', email: 'john@example.com' };
const validation = validateUserData(userData);

if (!validation.isValid) {
  console.log('Errors:', validation.errors);
}

if (isValidEmail('test@example.com')) {
  console.log('Valid email');
}
```

### Confirmation Dialogs

```javascript
import { confirmAction } from '../lib/utils';

const handleDelete = () => {
  if (confirmAction('Are you sure you want to delete this item?')) {
    // Proceed with deletion
  }
};
```

### Local Storage

```javascript
import { storage } from '../lib/utils';

// Save data
storage.set('user-preferences', { theme: 'dark', language: 'en' });

// Get data
const preferences = storage.get('user-preferences', { theme: 'light' });

// Remove data
storage.remove('user-preferences');
```

## 📋 Constants (`constants.js`)

### CSS Classes

```javascript
import { CSS_CLASSES } from '../lib/constants';

// Button styles
<button className={CSS_CLASSES.BUTTON.PRIMARY}>Primary Button</button>
<button className={CSS_CLASSES.BUTTON.DANGER}>Delete Button</button>

// Input styles
<input className={CSS_CLASSES.INPUT.DEFAULT} />
<input className={CSS_CLASSES.INPUT.ERROR} />

// Message styles
<div className={CSS_CLASSES.MESSAGE.SUCCESS}>Success message</div>
<div className={CSS_CLASSES.MESSAGE.ERROR}>Error message</div>
```

### Messages

```javascript
import { MESSAGES } from '../lib/constants';

showSuccess(MESSAGES.SUCCESS.USER_CREATED);
showError(MESSAGES.ERROR.USER_CREATE_FAILED);
```

### API Endpoints

```javascript
import { API_ENDPOINTS } from '../lib/constants';

const response = await fetch(API_ENDPOINTS.USERS);
const user = await fetch(API_ENDPOINTS.USER_BY_ID(123));
```

## 🏗️ Architecture Benefits

### 1. **Code Reusability**
- Functions and hooks can be used across multiple components
- Reduces code duplication
- Consistent behavior across the application

### 2. **Maintainability**
- Centralized logic makes updates easier
- Single source of truth for constants and configurations
- Easier to debug and test

### 3. **Consistency**
- Standardized CSS classes ensure consistent styling
- Unified error handling and messaging
- Consistent API interaction patterns

### 4. **Testability**
- Isolated functions are easier to unit test
- Hooks can be tested independently
- Mocking is simplified

### 5. **Developer Experience**
- Clear separation of concerns
- Easy to find and understand functionality
- Comprehensive documentation

## 🧪 Testing

### Testing Utilities
```javascript
// utils.test.js
import { validateUserData, isValidEmail } from '../lib/utils';

test('validates user data correctly', () => {
  const result = validateUserData({ name: '', email: 'invalid' });
  expect(result.isValid).toBe(false);
  expect(result.errors).toContain('name is required');
});
```

### Testing Hooks
```javascript
// hooks.test.js
import { renderHook, act } from '@testing-library/react';
import { useMessage } from '../lib/hooks';

test('shows and hides messages', () => {
  const { result } = renderHook(() => useMessage());
  
  act(() => {
    result.current.showSuccess('Test message');
  });
  
  expect(result.current.message).toBe('Test message');
  expect(result.current.messageType).toBe('success');
});
```

## 🔄 Migration Guide

### Before (Component with inline logic)
```javascript
function UserComponent() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      setUsers(data.users);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // More inline logic...
}
```

### After (Using shared utilities)
```javascript
import { useUsers, CSS_CLASSES } from '../lib';

function UserComponent() {
  const { users, loading, createUser, deleteUser } = useUsers();
  
  return (
    <div className={CSS_CLASSES.CARD.DEFAULT}>
      {/* Clean, declarative UI */}
    </div>
  );
}
```

## 📈 Performance Considerations

1. **Tree Shaking**: Import only what you need
2. **Memoization**: Hooks use `useCallback` and `useMemo` where appropriate
3. **Debouncing**: Built-in debouncing for search and input operations
4. **Caching**: Local storage utilities for client-side caching

## 🔮 Future Enhancements

1. **TypeScript Support**: Add TypeScript definitions
2. **More Hooks**: Add hooks for pagination, infinite scroll, etc.
3. **Theme System**: Expand CSS classes for theming support
4. **Internationalization**: Add i18n utilities
5. **Performance Monitoring**: Add performance tracking utilities

---

**Happy coding! 🚀**