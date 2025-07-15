# NodeTexture - Separated Frontend & Backend

A full-stack application with **Next.js frontend** (port 3000) and **Express.js backend** (port 6666) running as separate services.

## 🏗️ Architecture

```
📁 Project Structure
├── 🎨 Frontend (Next.js)     → http://localhost:3000
├── 🔧 Backend (Express.js)   → http://localhost:6666
└── 📡 API Communication     → REST API calls
```

## 🚀 Quick Start

### 1. Setup Database (First Time)

```bash
# Install dependencies
npm install

# Test database connection
npm run db:test

# Initialize database
npm run db:init
```

### 2. Start the Backend Server

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start backend server on port 6666
npm run dev
```

### 3. Start the Frontend Server

```bash
# In the root directory (separate terminal)
npm install
npm run dev
```

**Frontend**: [http://localhost:3000](http://localhost:3000)  
**Backend API**: [http://localhost:6666](http://localhost:6666)  
**Database**: MySQL (configured via `backend/.env`)

## 🗄️ Database System

The application uses a comprehensive MySQL database with:

- **44 Tables**: Complete e-commerce schema with audit logging
- **66 Triggers**: Automatic change tracking
- **JSON Support**: Advanced workflow management
- **Optimized Performance**: Indexed for fast queries

### Database Commands

```bash
# Test database connection
npm run db:test

# Initialize database with schema
npm run db:init

# Reset database (development only)
npm run db:reset
```

### Database Management

```bash
# Using the database manager script
cd database
./db-manager.sh help     # Show all commands
./db-manager.sh backup   # Create backup
./db-manager.sh restore backup.sql  # Restore backup
```

### Documentation

All database documentation is located in the `database/` directory:

- `README-DATABASE.md` - Complete setup guide
- `DATABASE_DESIGN.md` - Schema design and relationships
- `DATABASE_SUMMARY.md` - System overview
- `JSON_SYSTEM.md` - JSON column usage
- `AUDIT_SYSTEM.md` - Audit logging system

## 📡 Backend API Structure

### API Routes Location
The backend is a separate **Express.js server** with the following benefits:

- **Independent Scaling**: Frontend and backend can be scaled separately
- **Technology Flexibility**: Can use different frameworks for each layer
- **Microservices Ready**: Easy to split into multiple services
- **Database Integration**: Direct database connections without Next.js limitations

All backend API endpoints are located in the `backend/routes/` directory:

```
src/app/api/
├── hello/
│   └── route.js          # Basic API example
├── users/
│   ├── route.js          # Users CRUD operations
│   └── [id]/
│       └── route.js      # Individual user operations
```

### API Endpoints

#### Hello API
- **GET** `/api/hello` - Basic hello world endpoint
- **POST** `/api/hello` - Echo received data
- **PUT** `/api/hello` - Update data example
- **DELETE** `/api/hello` - Delete example

#### Users API
- **GET** `/api/users` - Get all users
  - Query params: `?limit=5` to limit results
- **POST** `/api/users` - Create a new user
- **GET** `/api/users/[id]` - Get specific user
- **PUT** `/api/users/[id]` - Update specific user
- **DELETE** `/api/users/[id]` - Delete specific user

### Example API Usage

#### Create a User
```javascript
const response = await fetch('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com'
  })
});

const data = await response.json();
```

#### Get All Users
```javascript
const response = await fetch('/api/users');
const data = await response.json();
console.log(data.users);
```

## 🏗️ Backend Architecture

### 1. API Routes (`src/app/api/`)
- **Purpose**: Define your REST API endpoints
- **Structure**: Each folder represents a route, `route.js` handles HTTP methods
- **Methods**: Export `GET`, `POST`, `PUT`, `DELETE` functions

### 2. Database Layer (`src/lib/db.js`)
- **Purpose**: Database connection and query utilities
- **Features**: Connection pooling, query helpers, CRUD operations
- **Usage**: Import and use in your API routes

### 3. Middleware (`src/middleware.js`)
- **Purpose**: Request processing, authentication, CORS
- **Features**: Route protection, logging, headers management
- **Scope**: Runs before all API routes and pages

### 4. Environment Configuration (`.env.local`)
- **Purpose**: Store sensitive configuration
- **Security**: Never commit `.env.local` to version control
- **Usage**: Access via `process.env.VARIABLE_NAME`

## 🔧 Adding New API Endpoints

1. **Create a new folder** in `src/app/api/`:
```bash
mkdir src/app/api/products
```

2. **Create route.js** with your HTTP methods:
```javascript
// src/app/api/products/route.js
export async function GET(request) {
  return Response.json({ products: [] });
}

export async function POST(request) {
  const data = await request.json();
  // Process the data
  return Response.json({ success: true });
}
```

3. **For dynamic routes**, use brackets:
```bash
mkdir src/app/api/products/[id]
# Create src/app/api/products/[id]/route.js
```

## 🛡️ Security Best Practices

1. **Environment Variables**: Store secrets in `.env.local`
2. **Input Validation**: Always validate request data
3. **Authentication**: Use middleware for protected routes
4. **CORS**: Configure appropriate CORS headers
5. **Rate Limiting**: Implement rate limiting for production

## 📦 Recommended Packages

For enhanced backend functionality:

```bash
# Database
npm install prisma @prisma/client  # ORM
npm install pg                     # PostgreSQL
npm install mongodb               # MongoDB

# Authentication
npm install next-auth             # Authentication
npm install jsonwebtoken          # JWT tokens

# Validation
npm install zod                   # Schema validation
npm install joi                   # Alternative validation

# Utilities
npm install bcryptjs              # Password hashing
npm install nodemailer            # Email sending
npm install multer                # File uploads
```

## 🚀 Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Other Platforms
- **Netlify**: Use `npm run build` and deploy `out/` folder
- **Railway**: Connect your GitHub repo
- **Heroku**: Add `heroku/nodejs` buildpack

## 📚 Learn More

- [Next.js API Routes Documentation](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Deployment Documentation](https://nextjs.org/docs/app/building-your-application/deploying)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
