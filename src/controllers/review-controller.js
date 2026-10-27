const mongoose = require("mongoose");
const Product = require("../models/product");
const Review = require("../models/review");
const httpError = require("../utils/http-error");
const getPagination = require("../utils/pagination");

async function createReview(req, res) {
  const product = await resolveProduct(req.body.productId || req.body.productSlug);
  const review = await Review.create({
    product: product._id,
    name: req.body.name,
    email: req.body.email,
    title: req.body.title,
    review: req.body.review,
    rating: req.body.rating,
  });
  res.status(201).json({ data: publicReview(review) });
}

async function listReviews(req, res) {
  const product = await resolveProduct(req.params.idOrSlug);
  const { page, limit, skip } = getPagination(req.query);
  const [items, summary] = await Promise.all([
    Review.find({ product: product._id })
      .select("-email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.aggregate([
      { $match: { product: product._id } },
      { $group: { _id: null, count: { $sum: 1 }, averageRating: { $avg: "$rating" } } },
    ]),
  ]);
  const total = summary[0]?.count || 0;
  res.json({
    data: items,
    summary: { count: total, averageRating: summary[0]?.averageRating || 0 },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function updateReview(req, res) {
  const updates = {};
  for (const field of ["name", "email", "title", "review", "rating"]) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  const review = await Review.findByIdAndUpdate(
    req.params.reviewId,
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!review) throw httpError(404, "Review not found");
  res.json({ data: publicReview(review) });
}

async function deleteReview(req, res) {
  const review = await Review.findByIdAndDelete(req.params.reviewId);
  if (!review) throw httpError(404, "Review not found");
  res.status(204).end();
}

async function resolveProduct(value) {
  if (!value || typeof value !== "string") {
    throw httpError(400, "productId or productSlug is required");
  }
  const product = await Product.findOne(
    mongoose.isValidObjectId(value) ? { _id: value } : { slug: value.toLowerCase() }
  ).select("_id");
  if (!product) throw httpError(404, "Product not found");
  return product;
}

function publicReview(review) {
  const result = review.toObject();
  delete result.email;
  return result;
}

module.exports = { createReview, listReviews, updateReview, deleteReview };
