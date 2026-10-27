const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 2000 },
    logo: { type: String, trim: true, maxlength: 2048 },
  },
  { timestamps: true }
);

brandSchema.index({ name: 1 });

module.exports = mongoose.model("Brand", brandSchema);
