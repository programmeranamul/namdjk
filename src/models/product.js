const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      index: true,
    },
    price: { type: Number, min: 0 },
    marketStatus: { type: String, trim: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    filters: {
      ram: { type: Number, min: 0 },
      storage: { type: Number, min: 0 },
      mainCamera: { type: Number, min: 0 },
      frontCamera: { type: Number, min: 0 },
      battery: { type: Number, min: 0 },
      display: { type: Number, min: 0 },
    },
  },
  { timestamps: true, minimize: false }
);

productSchema.index({ name: 1 });
productSchema.index({ "filters.ram": 1 });
productSchema.index({ "filters.storage": 1 });
productSchema.index({ "filters.mainCamera": 1 });
productSchema.index({ "filters.battery": 1 });
productSchema.index({ "filters.display": 1 });

module.exports = mongoose.model("Product", productSchema);
