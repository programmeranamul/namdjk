const mongoose = require("mongoose");
const Brand = require("../models/brand");
const Product = require("../models/product");
const Review = require("../models/review");
const httpError = require("../utils/http-error");
const getPagination = require("../utils/pagination");
const buildProductFilter = require("../utils/product-filters");
const slugify = require("../utils/slugify");

async function createProduct(req, res) {
  const data = req.body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw httpError(400, "data must contain the product details object");
  }

  const name = req.body.name || data.phone?.name;
  if (!name || typeof name !== "string") {
    throw httpError(400, "name or data.phone.name is required");
  }
  const brand = await resolveBrand(req.body.brandId || req.body.brand || data.phone?.brand);
  const product = await Product.create({
    slug: req.body.slug ? slugify(req.body.slug) : slugify(name),
    name,
    brand: brand._id,
    price: req.body.price ?? data.phone?.price,
    marketStatus: req.body.marketStatus ?? data.phone?.marketStatus,
    data,
    filters: buildFilters(data, req.body.filters),
  });
  res.status(201).json({ data: await product.populate("brand", "name slug") });
}

async function listProducts(req, res) {
  const { page, limit, skip } = getPagination(req.query);
  const sort = getProductSort(req.query.sort);
  const filter = await buildListFilter(req.query);
  if (!filter) return sendEmptyProductList(res, page, limit);

  const productQuery = Product.find(filter)
    .select("_id slug brand data.phone")
    .populate("brand", "name slug");
  if (sort) productQuery.sort(sort);
  const [items, total] = await Promise.all([
    productQuery.skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  res.json({
    data: items.map(toProductSummary),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function listLatestProducts(req, res) {
  return listCompactProducts(req, res, {});
}

async function listOfficialPhones(req, res) {
  return listCompactProducts(req, res, { "data.phone.priceStatus": "Official" });
}

async function listUnofficialPhones(req, res) {
  return listCompactProducts(req, res, { "data.phone.priceStatus": "Unofficial" });
}

async function listUpcomingPhones(req, res) {
  return listCompactProducts(req, res, {
    $or: [
      { marketStatus: /^upcoming$/i },
      { "data.phone.marketStatus": /^upcoming$/i },
      { "data.phone.priceStatus": /^upcoming$/i },
    ],
  });
}

async function listCompactProducts(req, res, baseFilter) {
  const { page, limit, skip } = getPagination(req.query);
  const sort = getProductSort(req.query.sort);
  const filter = await buildListFilter(req.query, baseFilter);
  if (!filter) return sendEmptyProductList(res, page, limit);

  const productQuery = Product.find(filter)
    .select("_id slug brand data.phone")
    .populate("brand", "name slug");
  if (sort) productQuery.sort(sort);
  const [items, total] = await Promise.all([
    productQuery.skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  res.json({
    data: items.map(toProductSummary),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

function getProductSort(value) {
  if (value === undefined) return null;
  if (value === "price_high_to_low") return { price: -1 };
  if (value === "price_low_to_high") return { price: 1 };
  throw httpError(400, "sort must be price_high_to_low or price_low_to_high");
}

async function buildListFilter(query, baseFilter = {}) {
  let brandId;

  if (query.brand) {
    const brand = await Brand.findOne({
      $or: [
        { slug: String(query.brand).toLowerCase() },
        { name: new RegExp(`^${escapeRegex(String(query.brand))}$`, "i") },
      ],
    }).select("_id").lean();
    if (!brand) return null;
    brandId = brand._id;
  }

  const queryFilter = buildProductFilter(query, { brandId });
  const conditions = [];
  if (Object.keys(baseFilter).length) conditions.push(baseFilter);
  if (Object.keys(queryFilter).length) conditions.push(queryFilter);
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}




function sendEmptyProductList(res, page, limit) {
  return res.json({
    data: [],
    pagination: { page, limit, total: 0, pages: 0 },
  });
}

function toProductSummary(item) {
  const phone = item.data?.phone || {};
  return {
    id: item._id,
    slug: item.slug,
    name: phone.name,
    image: phone.image,
    marketStatus: phone.marketStatus,
    releaseDate: phone.releaseDate,
    brand: item.brand?.name || phone.brand,
    price: phone.price,
    priceStatus: phone.priceStatus,
    score: phone.score,
    variant: phone.variant,
    variantRegion: phone.variantRegion,
    variantPrice: phone.variantPrice,
    updatedAt: phone.updatedAt,
    imageCount: phone.imageCount,
    colorCount: phone.colorCount,
  };
}

async function getProduct(req, res) {
  const product = await findProduct(req.params.idOrSlug);
  if (!product) throw httpError(404, "Product not found");
  res.json({ data: await product.populate("brand", "name slug") });
}

async function updateProduct(req, res) {
  const product = await findProduct(req.params.idOrSlug);
  if (!product) throw httpError(404, "Product not found");

  if (req.body.data !== undefined) {
    if (!req.body.data || typeof req.body.data !== "object" || Array.isArray(req.body.data)) {
      throw httpError(400, "data must be a product details object");
    }
    product.data = req.body.data;
    product.filters = buildFilters(req.body.data, req.body.filters);
  } else if (req.body.filters) {
    product.filters = buildFilters(product.data, req.body.filters);
  }
  if (req.body.name !== undefined) product.name = req.body.name;
  else if (req.body.data?.phone?.name) product.name = req.body.data.phone.name;
  if (req.body.slug !== undefined) product.slug = slugify(req.body.slug);
  else if (req.body.name !== undefined) product.slug = slugify(req.body.name);
  if (req.body.price !== undefined) product.price = req.body.price;
  else if (req.body.data?.phone?.price !== undefined) product.price = req.body.data.phone.price;
  if (req.body.marketStatus !== undefined) product.marketStatus = req.body.marketStatus;
  else if (req.body.data?.phone?.marketStatus !== undefined) {
    product.marketStatus = req.body.data.phone.marketStatus;
  }
  if (req.body.brandId || req.body.brand) {
    product.brand = (await resolveBrand(req.body.brandId || req.body.brand))._id;
  }

  await product.save();
  res.json({ data: await product.populate("brand", "name slug") });
}

async function deleteProduct(req, res) {
  const product = await findProduct(req.params.idOrSlug);
  if (!product) throw httpError(404, "Product not found");
  await Promise.all([Review.deleteMany({ product: product._id }), product.deleteOne()]);
  res.status(204).end();
}

async function findProduct(idOrSlug) {
  const filter = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: String(idOrSlug).toLowerCase() };
  return Product.findOne(filter);
}

async function resolveBrand(value) {
  if (!value || typeof value !== "string") {
    throw httpError(400, "brandId or an existing brand name is required");
  }
  const brand = await Brand.findOne(
    mongoose.isValidObjectId(value)
      ? { _id: value }
      : { $or: [{ slug: slugify(value) }, { name: new RegExp(`^${escapeRegex(value)}$`, "i") }] }
  );
  if (!brand) throw httpError(400, `Brand "${value}" does not exist; create it first`);
  return brand;
}

function buildFilters(data, overrides = {}) {
  const specifications = Array.isArray(data.quickSpecifications)
    ? [...data.quickSpecifications]
    : [];
  for (const group of Array.isArray(data.specificationGroups) ? data.specificationGroups : []) {
    const groupName = [group?.title, group?.name, group?.label, group?.group]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLowerCase();
    const items = Array.isArray(group?.items)
      ? group.items
      : Array.isArray(group?.specifications)
        ? group.specifications
        : Array.isArray(group?.specs)
          ? group.specs
          : [];
    specifications.push(...items);

    for (const subgroup of Array.isArray(group?.subgroups) ? group.subgroups : []) {
      if (Array.isArray(subgroup?.items)) specifications.push(...subgroup.items);
    }

    for (const item of items) {
      const label = String(item?.label || item?.name || item?.key || "").toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (/display|screen/.test(groupName) && label === "size") {
        specifications.push({ label: "display size", value: item.value });
      } else if (/battery/.test(groupName) && label === "type") {
        specifications.push({ label: "battery type", value: item.value });
      }
    }
  }
  const specValues = new Map();
  for (const specification of specifications) {
    if (typeof specification?.label !== "string" || specification.value === undefined) continue;
    const key = specification.label.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!specValues.has(key)) specValues.set(key, String(specification.value));
  }
  const getSpec = (...labels) => labels.map((label) => specValues.get(label)).find(Boolean);
  const getNumber = (value) => {
    const text = String(value || "");
    if (/^\s*\d+(?:\.\d+)?\s*-\s*\d+/.test(text)) return undefined;
    const match = text.match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  };
  const filters = {
    ram: getNumber(getSpec("ram", "memory") ?? data.phone?.ram),
    storage: getNumber(getSpec("storage", "internalstorage") ?? data.phone?.storage),
    mainCamera: getNumber(
      getSpec("maincamera", "cameraresolution", "rearcamera", "primarycamera") ??
      data.phone?.camera?.resolution ??
      data.phone?.mainCamera
    ),
    frontCamera: getNumber(
      getSpec("frontcamera", "selfiecamera") ?? data.phone?.camera?.front
    ),
    battery: getNumber(
      getSpec("battery", "batterycapacity") ??
      data.phone?.battery?.capacity ??
      data.phone?.battery
    ),
    display: getNumber(
      getSpec("display", "displaysize", "screensize") ??
      data.phone?.display?.size ??
      data.phone?.displaySize ??
      (typeof data.phone?.display === "string" ? data.phone.display : undefined) ??
      data.display?.size
    ),
  };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!Object.hasOwn(filters, key)) throw httpError(400, `Unsupported filter field: ${key}`);
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw httpError(400, `filters.${key} must be a non-negative number`);
    }
    filters[key] = number;
  }
  return filters;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  createProduct,
  listProducts,
  listLatestProducts,
  listOfficialPhones,
  listUnofficialPhones,
  listUpcomingPhones,
  getProduct,
  updateProduct,
  deleteProduct,
};
