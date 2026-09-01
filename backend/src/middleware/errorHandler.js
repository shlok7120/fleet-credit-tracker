/** Wraps an async route so a rejected promise reaches Express's error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Final error handler. Must be registered LAST, after all routes. */
export const errorHandler = (err, req, res, _next) => {
  console.error('[error]', err.message);

  // Postgres unique-violation -> friendly message instead of a 500.
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That record already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist.' });
  }
  if (err.code === '22P02' || err.code === '23514') {
    return res.status(400).json({ error: 'Invalid value supplied.' });
  }

  res.status(err.status || 500).json({
    error: err.expose ? err.message : 'Something went wrong on the server.',
  });
};
