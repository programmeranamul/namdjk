const LatestComparison = require("../models/latest-comparison");
const httpError = require("../utils/http-error");
const getPagination = require("../utils/pagination");

async function createLatestComparison(req, res) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw httpError(400, "request body must be an object");
  }

  const { phone1, phone2 } = req.body;
  validatePhone(phone1, "phone1");
  validatePhone(phone2, "phone2");

  const comparison = await LatestComparison.create({ phone1, phone2 });
  res.status(201).json({ data: comparison });
}

async function listLatestComparisons(req, res) {
  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    LatestComparison.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LatestComparison.countDocuments(),
  ]);

  res.json({
    data: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

function validatePhone(phone, field) {
  if (!phone || typeof phone !== "object" || Array.isArray(phone)) {
    throw httpError(400, `${field} must be an object`);
  }

  for (const property of ["name", "price", "score", "image", "slug"]) {
    if (typeof phone[property] !== "string" || !phone[property].trim()) {
      throw httpError(400, `${field}.${property} is required and must be a non-empty string`);
    }
  }
}

module.exports = { createLatestComparison, listLatestComparisons };
