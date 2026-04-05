# NodeTexeure - Project Overview

**Version:** 1.0  
**Last Updated:** April 5, 2026

---

## 📋 Project Summary

NodeTexeure is a full-stack luxury bed texture e-commerce platform specializing in premium silk and cashmere bedding products. The platform features a customer-facing storefront, comprehensive admin dashboard, and robust backend API.

### Tech Stack

**Frontend (Port 3000)**
- Next.js 15.3.5
- React 19
- TailwindCSS 4
- Context API for state management

**Backend (Port 6666)**
- Express.js
- Node.js v22.15.1
- JWT authentication
- Rate limiting (1000/15min, 10000/hour)

**Admin Dashboard (Port 3005)**
- Next.js
- TypeScript
- Separate authentication

**Database**
- MySQL
- 44 tables with audit logging
- 66 triggers
- Custom ID system with prefixes
- JSON support for flexible data

**Infrastructure**
- AWS (production): EC2, S3, SES, Certificate Manager
- Local development: macOS
- No Docker (per requirements)

---

## 🎯 Business Model

### Target Market
- Premium bedding customers globally
- Focus on silk and cashmere products
- Multi-language: English, Simplified Chinese
- Multi-currency with real-time exchange rates

### Product Catalog
- **Materials:** Silk, Cashmere, Blends
- **Categories:** Sheets, Comforters, Pillowcases, Throws, Runners
- **Variants:** Size, Color, Thread Count, Weight, Organic status
- **Images:** 20-40 per product with auto-generated thumbnails

### Pricing & Payment
- Stripe (primary)
- PayPal (secondary option)
- Real-time tax calculation by region
- Coupon/discount system

### Shipping
- FedEx integration (service built, needs API credentials)
- Weight-based + zone-based calculation
- International shipping support
- Real-time tracking via `/track-order` page

---

## 🏗️ Architecture

### Application Structure
```
nodeTexeure/
├── src/                    # Frontend (Next.js)
│   ├── app/               # Next.js 15 app router
│   ├── components/        # React components
│   ├── lib/              # Utilities
│   └── styles/           # CSS
├── backend/               # Express.js API
│   ├── routes/           # API endpoints
│   ├── middleware/       # Auth, CSRF, logging
│   ├── utils/            # Helpers
│   └── uploads/          # Product images
├── admin-dashboard/       # Admin panel (separate app)
│   └── src/
│       ├── app/
│       └── components/
├── database/             # SQL schemas & docs
└── docs/                 # Documentation
```

### Service Separation
- **Frontend:** Customer-facing UI, shopping experience
- **Backend:** REST API, business logic, database access
- **Admin:** Product/order/user management, analytics

---

## 🔐 Security

### Authentication
- JWT tokens (stateless)
- Role-based access control (Admin, Staff, Customer)
- Password hashing with bcrypt
- Session timeout: 24 hours

### API Security
- CSRF protection
- Rate limiting (global + per-user)
- Input validation & sanitization
- SQL injection prevention (prepared statements)
- HTTPS/SSL (AWS Certificate Manager)

### PCI Compliance
- Stripe handles card processing
- No card data stored locally
- PCI DSS compliant payment flow

---

## 🚀 Quick Start

### Prerequisites
```bash
node --version  # v22.15.1 or higher
npm --version
mysql --version
```

### Initial Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with database credentials

# 3. Initialize database
npm run db:test    # Test connection
npm run db:init    # Create schema

# 4. Start development
npm run dev        # Starts frontend + backend
```

### Port Configuration
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:6666
- **Admin Dashboard:** http://localhost:3005

### Common Commands
```bash
# Development
npm run dev              # Start all services
npm run dev:frontend     # Frontend only
npm run dev:backend      # Backend only

# Database
npm run db:init          # Initialize database
npm run db:reset         # Reset database (dev only)
npm run db:test          # Test connection

# Process Management
npm run pm2:dev          # Start with PM2
npm run pm2:stop         # Stop all
npm run pm2:restart      # Restart all
npm run pm2:logs         # View logs

# Cleanup
npm run clean            # Clear Next.js cache
npm run clean:full       # Stop + clean + restart
```

---

## 📁 Key Files

### Configuration
- `.env` - Environment variables (not in git)
- `.env.example` - Template for environment setup
- `package.json` - Dependencies & scripts
- `next.config.mjs` - Next.js configuration

### Documentation
- `README.md` - This file
- `BACKEND.md` - API & backend documentation
- `FRONTEND.md` - Frontend development guide
- `DATABASE.md` - Database schema & design
- `TROUBLESHOOTING.md` - Common issues & fixes

### Database
- `database/database_schema.sql` - Full schema
- `database/init-database.js` - Setup script
- `database/test-db-connection.js` - Connection test

---

## 🗂️ Current Status

### ✅ Completed
- User authentication & authorization
- Product catalog with advanced search
- Shopping cart (guest + logged-in)
- Order management system
- Admin dashboard (products, orders, users, coupons)
- Email template system
- Inventory tracking
- Role-based permissions
- Database with audit logging
- Enhanced search with autocomplete
- Product reviews & ratings system
- Admin analytics dashboard
- Stripe payment service (needs API keys to activate)
- AWS SES email service with producer/consumer daemon
- AWS S3 image upload service
- FedEx shipping service with rate calculation
- Order confirmation & tracking pages
- Sitemap & robots.txt for SEO

### 🚧 In Progress
- Admin review moderation UI
- End-to-end integration testing with live API keys

### 📋 Planned Features
See `TODO.md` for detailed task list

---

## 👥 User Roles

### Customer
- Browse & search products
- Add to cart & checkout
- View order history
- Manage profile & addresses
- Leave product reviews

### Staff
- Upload new products (pending approval)
- Set initial prices & stock
- Link tracking numbers to orders
- View assigned orders
- Basic support tasks

### Admin
- Approve/reject products
- Modify prices & inventory
- Manage users & permissions
- Create/edit coupons
- Configure system settings
- View analytics & reports
- Manage email templates

---

## 🌍 Internationalization

### Languages
- English (primary)
- Simplified Chinese

### Localization
- Currency conversion (real-time rates)
- Regional tax calculation
- Timezone handling (UTC → local)
- SEO-friendly URLs (English only)
- Search supports both languages

---

## 📊 Analytics & Reporting

### Metrics Tracked
- Sales by product/category
- Revenue trends
- Customer acquisition
- Inventory levels
- Order fulfillment times

### Reports Available
- Daily/weekly/monthly sales
- Low stock alerts
- Customer analytics
- Product performance

---

## 🛠️ Troubleshooting

### Common Issues

**Port conflicts:**
```bash
lsof -i :3000
kill -9 $(lsof -ti:3000)
```

**Cache issues:**
```bash
npm run clean:full
```

**Database connection:**
```bash
npm run db:test
```

See `TROUBLESHOOTING.md` for detailed solutions.

---

## 📞 Support & Resources

### Documentation
- Backend API: See `BACKEND.md`
- Frontend Guide: See `FRONTEND.md`
- Database Schema: See `DATABASE.md`

### Development
- Node.js: https://nodejs.org/
- Next.js: https://nextjs.org/
- Express: https://expressjs.com/
- MySQL: https://dev.mysql.com/doc/

### Deployment
- AWS EC2: Compute
- AWS S3: Image storage
- AWS SES: Email delivery
- AWS Certificate Manager: SSL/TLS

---

## 📝 Notes

### Design Philosophy
- **Clean separation** between frontend, backend, admin
- **Security first** approach
- **Scalable architecture** ready for growth
- **Developer friendly** with clear documentation

### Code Standards
- ESNext features
- No TypeScript (per requirements)
- Prepared statements for SQL
- RESTful API design
- Responsive UI (mobile-first)

### Performance
- Image optimization (thumbnails)
- Database indexing
- Query optimization
- CDN for static assets (planned)
- Redis caching (future)

---

**Last Updated:** April 5, 2026  
**Current Version:** 1.0  
**Status:** Active Development
