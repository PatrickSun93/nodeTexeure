-- Migration to add password reset and soft delete fields to users table

ALTER TABLE users
ADD COLUMN resetToken VARCHAR(255) DEFAULT NULL,
ADD COLUMN resetTokenExpiry DATETIME DEFAULT NULL,
ADD COLUMN isDeleted BOOLEAN DEFAULT FALSE;