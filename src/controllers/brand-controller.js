const Brand = require("../models/brand");
const Product = require("../models/product");
const httpError = require("../utils/http-error");
const getPagination = require("../utils/pagination");
const slugify = require("../utils/slugify");

async function createBrand(req, res) {
  const { name, description, logo } = req.body;
  if (!name || typeof name !== "string") {
    throw httpError(400, "name is required");
  }

  const brand = await Brand.create({
    name,
    slug: slugify(req.body.slug || name),
    description,
    logo,
  });
  res.status(201).json({ data: brand });
}

async function listBrands(req, res) {
  const { page, limit, skip } = getPagination(req.query);
  const filter = req.query.name
    ? { name: new RegExp(escapeRegex(String(req.query.name)), "i") }
    : {};
  const [items, total] = await Promise.all([
    Brand.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Brand.countDocuments(filter),
  ]);
  res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

async function getBrand(req, res) {
  const brand = await Brand.findOne({ slug: req.params.slug }).lean();
  if (!brand) {
    throw httpError(404, "Brand not found");
  }
  res.json({ data: brand });
}

async function updateBrand(req, res) {
  const updates = {};
  for (const field of ["name", "description", "logo"]) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (req.body.slug !== undefined) updates.slug = slugify(req.body.slug);
  else if (updates.name) updates.slug = slugify(updates.name);

  const brand = await Brand.findOneAndUpdate(
    { slug: req.params.slug },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!brand) {
    throw httpError(404, "Brand not found");
  }
  res.json({ data: brand });
}

async function deleteBrand(req, res) {
  const brand = await Brand.findOne({ slug: req.params.slug });
  if (!brand) {
    throw httpError(404, "Brand not found");
  }
  if (await Product.exists({ brand: brand._id })) {
    throw httpError(409, "Brand cannot be deleted while it has products");
  }
  await brand.deleteOne();
  res.status(204).end();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { createBrand, listBrands, getBrand, updateBrand, deleteBrand };
