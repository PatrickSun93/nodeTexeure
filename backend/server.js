const express = require('express');
const cors = require('cors');
const path = require('path');
const LoggingMiddleware = require('./middleware/loggingMiddleware');

const app = express();
const PORT = process.env.PORT || 6666;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Frontend URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Comprehensive logging middleware
app.use(LoggingMiddleware.middleware());

// Mock database
let users = [
  { id: 1, name: 'John Doe', email: 'john@example.com', createdAt: new Date().toISOString() },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date().toISOString() }
];
let nextUserId = 3;

// Import routes
const statusRoutes = require('./routes/statusRoutes');
const databaseRoutes = require('./routes/databaseRoutes');

// Routes
// Status routes (health, hello)
app.use('/api/status', statusRoutes);

// Database routes (connection testing, data retrieval)
app.use('/api/database', databaseRoutes);

// Backward compatibility - redirect old endpoints to new structure
app.get('/api/health', (req, res) => {
  res.redirect(301, '/api/status/health');
});

app.get('/api/hello', (req, res) => {
  res.redirect(301, '/api/status/hello');
});

app.post('/api/hello', (req, res) => {
  res.redirect(307, '/api/status/hello');
});

// Users endpoints
app.get('/api/users', (req, res) => {
  res.json({
    users,
    total: users.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ 
      error: 'Name and email are required',
      timestamp: new Date().toISOString()
    });
  }
  
  const newUser = {
    id: nextUserId++,
    name,
    email,
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  
  res.status(201).json({
    message: 'User created successfully',
    user: newUser,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    return res.status(404).json({ 
      error: 'User not found',
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({
    user,
    timestamp: new Date().toISOString()
  });
});

app.put('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { name, email } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return res.status(404).json({ 
      error: 'User not found',
      timestamp: new Date().toISOString()
    });
  }
  
  if (name) users[userIndex].name = name;
  if (email) users[userIndex].email = email;
  users[userIndex].updatedAt = new Date().toISOString();
  
  res.json({
    message: 'User updated successfully',
    user: users[userIndex],
    timestamp: new Date().toISOString()
  });
});

app.delete('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return res.status(404).json({ 
      error: 'User not found',
      timestamp: new Date().toISOString()
    });
  }
  
  const deletedUser = users.splice(userIndex, 1)[0];
  
  res.json({
    message: 'User deleted successfully',
    user: deletedUser,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Logging error middleware (logs errors before handling them)
app.use(LoggingMiddleware.errorMiddleware());

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🔗 Frontend should connect from http://localhost:3000`);
  console.log(`✅ Server ready to accept connections`);
});

module.exports = app;