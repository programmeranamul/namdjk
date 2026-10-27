const httpError = require("./http-error");

function getPagination(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  if (!Number.isInteger(page) || page < 1) {
    throw httpError(400, "page must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, "limit must be an integer between 1 and 100");
  }

  return { page, limit, skip: (page - 1) * limit };
}

module.exports = getPagination;
