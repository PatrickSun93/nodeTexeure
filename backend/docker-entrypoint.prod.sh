#!/bin/sh
# Production entrypoint: wait for MySQL, then start the server.
# Does NOT seed — production data is real. Run schema/migrations as a deploy step.
set -e

echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
until mysqladmin ping -h "$DB_HOST" -P "$DB_PORT" -uroot -p"$DB_PASSWORD" --silent >/dev/null 2>&1; do
  sleep 2
done
echo "MySQL ready. Starting backend (production, port ${PORT})..."
exec node server.js
