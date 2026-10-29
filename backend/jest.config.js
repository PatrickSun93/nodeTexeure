module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/env.js'],
  testTimeout: 30000,
  // Background services (abandoned-cart detector, email processor) keep timers alive.
  forceExit: true,
};
