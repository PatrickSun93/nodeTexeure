# E-Commerce Platform Implementation Todo List

This todo list is based on the system architecture design discussions for the bed texture e-commerce platform using Node.js, Next.js, and MySQL. It outlines tasks for a full-stack engineer to follow, prioritized by phases: Setup, Core Features, Integrations, and Enhancements. Focus on security, as this is an e-commerce site.

## Phase 1: Project Setup and Configuration
- [x] Set up the development environment:
  - Verify Node.js installation and version compatibility.
  - Configure Next.js for frontend on port 3000.
  - Set up backend server on port 6666.
  - Check if ports 3000 and 6666 are in use; kill processes if necessary.
- [x] Initialize MySQL database:
  - Run `database_schema.sql` to create tables.
  - Configure database connection in `backend/utils/database.js`.
  - Test connection using `test-db-connection.js`.
- [x] Configure environment variables:
  - Create or update `.env` file with database URL, JWT secret.
  - Add AWS SES and Stripe keys securely (do not commit).
- [] Implement basic authentication:
  - Set up JWT generation on login in `userRoutes.js`.
  - Implement token validation middleware.
  - Handle token expiration (e.g., 24 hours) and refresh logic.

## Phase 2: Core Features Implementation
- [x] Develop user management:
  - [x] Create registration endpoint: Validate input, hash password, insert user to DB.
  - [x] Implement login endpoint: Verify credentials, generate JWT.
  - [x] Add profile endpoint: Fetch and update user details with auth check.
- [x] Build product catalog:
  - [x] Develop API for product listing: Query DB with pagination.
  - [x] Add search with filters: Implement query parameters for categories, price, etc.
  - [x] Create product details endpoint: Fetch single product by ID.
- [x] Implement shopping cart:
  - [x] Set up session-based cart for guests using cookies or local storage.
  - [x] Persist cart in DB for logged-in users.
  - [x] Handle cart merge on login: Combine guest cart with user cart.
- [x] Set up checkout process:
  - [x] Create order creation endpoint: Calculate totals, apply coupons.
  - [x] Validate coupons: Check expiration, min_order_value, max_percentage.
  - [x] Handle invalid coupons: Return warning message to user.
- [ ] Build internal operations tools (no separate admin dashboard):
  - Implement role-based access: Check user roles in middleware.
  - Create endpoints for managing products: Add, update, delete.
  - Add coupon management: Create, edit (including expiration), delete.
  - Manage inventory and users via dedicated routes.
  - Integrate analytics views and operational metrics within the existing frontend.
  - Note: internal tools run within the main app (port 3000), protected by RBAC.

## Phase 3: Integrations
- [ ] Integrate Stripe for payments:
  - Install Stripe SDK in backend.
  - Create payment intent endpoint for credit/debit cards.
  - Handle webhook for payment confirmation.
- [ ] Configure email services:
  - Install Nodemailer and configure with AWS SES credentials.
  - Implement send email function for transactional emails (e.g., order confirmation).
  - Add basic email analytics tracking.
- [ ] Implement inventory management:
  - Set up basic stock tracking: Update stock on order placement.
  - (Low priority) Add low stock alerts: Check thresholds and send emails to authorized staff.

## Phase 4: Enhancements and Testing
- [ ] Add security measures:
  - Validate all inputs: Use libraries like Joi for schema validation.
  - Prevent SQL injection: Use prepared statements in database.js.
  - Mitigate XSS: Sanitize user inputs.
  - Ensure HTTPS: Configure SSL in production setup.
- [ ] Implement global features:
  - Add multi-language support: Use i18n library in Next.js.
  - Implement multi-currency: Integrate exchange rate API.
  - Set up shipping integrations: API calls for rates and tracking.
- [ ] Optimize performance:
  - Implement caching: Use Redis for frequent queries.
  - Set up CDN for static assets.
  - Configure S3 for image uploads and storage.
- [ ] Write tests:
  - Create unit tests for APIs (e.g., user registration).
  - Develop integration tests for authentication flow.
  - Test checkout process including coupon validation.
- [ ] Documentation:
  - Update README.md with setup instructions.
  - Refine system_design.md with final details.

Prioritize security and test thoroughly. If issues arise, refer back to design discussions.