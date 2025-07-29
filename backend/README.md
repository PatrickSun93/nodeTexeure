# NodeTexture Backend API

Express.js backend server for the NodeTexture application.

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The backend server will start on **http://localhost:6666**

### Production

To run in production mode:
```bash
npm start
```

## 📡 API Endpoints

### Health Check
- **GET** `/api/health` - Check if the backend server is running

### Hello Endpoint
- **GET** `/api/hello` - Basic hello world endpoint
- **POST** `/api/hello` - Hello with custom name

### Users Management
- **GET** `/api/users` - Get all users
- **POST** `/api/users` - Create a new user
- **GET** `/api/users/:id` - Get user by ID
- **PUT** `/api/users/:id` - Update user by ID
- **DELETE** `/api/users/:id` - Delete user by ID

## 🔧 Configuration

Environment variables are configured in `.env` file:

```env
PORT=6666
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## 📝 API Usage Examples

### Get All Users
```bash
curl http://localhost:6666/api/users
```

### Create a New User
```bash
curl -X POST http://localhost:6666/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

### Get User by ID
```bash
curl http://localhost:6666/api/users/1
```

### Update User
```bash
curl -X PUT http://localhost:6666/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "John Smith", "email": "johnsmith@example.com"}'
```

### Delete User
```bash
curl -X DELETE http://localhost:6666/api/users/1
```

## 🏗️ Project Structure

```
backend/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── .env              # Environment variables
└── README.md         # This file
```

## 🔒 CORS Configuration

The backend is configured to accept requests from:
- Frontend: `http://localhost:3000`

To add more allowed origins, update the CORS configuration in `server.js`.

## 🛠️ Development

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with auto-reload (nodemon)

### Adding New Endpoints

1. Add your route handler in `server.js`:
```javascript
app.get('/api/your-endpoint', (req, res) => {
  res.json({ message: 'Your response' });
});
```

2. Test your endpoint:
```bash
curl http://localhost:6666/api/your-endpoint
```

## 📦 Dependencies

- **express** - Web framework for Node.js
- **cors** - Enable CORS for cross-origin requests
- **dotenv** - Load environment variables from .env file
- **nodemon** (dev) - Auto-restart server during development

## 🚀 Deployment

For production deployment:

1. Set environment variables:
```bash
export PORT=6666
export NODE_ENV=production
export FRONTEND_URL=https://your-frontend-domain.com
```

2. Start the server:
```bash
npm start
```

## 🔮 Future Enhancements

- [ ] Add database integration (PostgreSQL/MongoDB)
- [ ] Implement JWT authentication
- [ ] Add input validation with Joi/Zod
- [ ] Add API rate limiting
- [ ] Add comprehensive error handling
- [ ] Add API documentation with Swagger
- [ ] Add unit and integration tests
- [ ] Add logging with Winston
- [ ] Add caching with Redis