/**
 * Background-job coordination with the Rust worker (rust/crates/api/src/jobs).
 *
 * Both may run the same jobs (Node stays the rollback target), so each run
 * holds a MySQL named lock: the same names as `jobs::*_LOCK` in Rust. A run
 * that finds the lock taken is skipped; MySQL drops a lock whose connection
 * dies, so it can't get stuck.
 *
 * BACKGROUND_JOBS=off (set when the `worker` service runs them) stops the
 * backend's own timers; anything else keeps them on.
 */
const DatabaseUtil = require('./database');

const LOCKS = {
  releaseReservations: 'nodetexeure:release_expired_reservations',
  abandonedCarts: 'nodetexeure:abandoned_cart_detection',
  migrations: 'nodetexeure:migrations',
};

const backgroundJobsEnabled = () =>
  (process.env.BACKGROUND_JOBS || '').trim().toLowerCase() !== 'off';

/**
 * Runs `fn` under the named lock.
 * @returns {Promise<{ran: boolean, result?: any}>} ran=false when another
 *   instance holds the lock.
 */
async function withJobLock(name, fn) {
  const conn = await DatabaseUtil.getConnection();
  let healthy = true;
  try {
    const [[{ got }]] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [name]);
    if (Number(got) !== 1) return { ran: false };
    try {
      return { ran: true, result: await fn() };
    } finally {
      // A connection still holding the lock must not go back to the pool.
      await conn.query('SELECT RELEASE_LOCK(?)', [name]).catch(() => { healthy = false; });
    }
  } finally {
    if (healthy) conn.release();
    else conn.destroy();
  }
}

module.exports = { LOCKS, withJobLock, backgroundJobsEnabled };
