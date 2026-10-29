#!/bin/sh
# Waits for MySQL, seeds demo data on an empty DB, then starts the dev server.
set -e

echo "⏳ Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
until mysqladmin ping -h "$DB_HOST" -P "$DB_PORT" -uroot -p"$DB_PASSWORD" --silent >/dev/null 2>&1; do
  sleep 2
done
echo "✅ MySQL is ready."

echo "🗄️  Applying schema migrations..."
npm run migrate

USERS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -uroot -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "")
if [ -z "$USERS" ] || [ "$USERS" = "0" ]; then
  echo "🌱 Empty database — seeding demo data (admin@example.com / Admin@123, alice.customer@example.com / Customer@123)..."
  npm run seed:rnd || echo "⚠️  seed step failed (continuing — you can run 'docker compose exec backend npm run seed:rnd')"
  # Rich example data (orders, reviews, wishlist, product images) so the storefront/admin
  # show real data. Script is idempotent (removes its own 'EXAMPLE-' rows first), so
  # re-runs never duplicate.
  npm run seed:example || echo "⚠️  example-data seed failed (continuing — you can run 'docker compose exec backend npm run seed:example')"
else
  echo "📊 Database already has ${USERS} users — skipping seed."
fi

echo "📧 Starting email daemon (background — delivers queued transactional emails)..."
npm run email-daemon &

echo "🚀 Starting backend (nodemon, port ${PORT})..."
exec npm run dev
