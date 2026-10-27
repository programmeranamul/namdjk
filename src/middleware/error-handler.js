function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ error: error.message });
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || "value";
    return res.status(409).json({ error: `${field} already exists` });
  }

  const status = error.status || 500;
  if (status >= 500) {
    console.error(error);
  }
  return res.status(status).json({ error: status >= 500 ? "Internal server error" : error.message });
}

module.exports = errorHandler;
