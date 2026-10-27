const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    review: { type: String, required: true, trim: true, maxlength: 10000 },
    rating: { type: Number, required: true, min: 1, max: 5 },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
