const mongoose = require("mongoose");

const phoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    price: { type: String, required: true, trim: true, maxlength: 50 },
    score: { type: String, required: true, trim: true, maxlength: 20 },
    image: { type: String, required: true, trim: true, maxlength: 500 },
    slug: { type: String, required: true, trim: true, lowercase: true },
  },
  { _id: false }
);

const latestComparisonSchema = new mongoose.Schema(
  {
    phone1: { type: phoneSchema, required: true },
    phone2: { type: phoneSchema, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LatestComparison", latestComparisonSchema);
