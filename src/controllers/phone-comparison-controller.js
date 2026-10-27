const Product = require("../models/product");
const httpError = require("../utils/http-error");
const { normalizeComparison } = require("../utils/phone-comparison");

async function comparePhones(req, res) {
  const slugs = parseSlugs(req.query.slugs);
  const products = await Product.find({ slug: { $in: slugs } })
    .select(
      "_id slug name brand price marketStatus data.phone data.quickSpecifications data.fullSpecificationPreview data.specificationGroups"
    )
    .populate("brand", "name slug")
    .lean();

  const productsBySlug = new Map(products.map((product) => [product.slug, product]));
  const missingSlugs = slugs.filter((slug) => !productsBySlug.has(slug));
  if (missingSlugs.length) {
    throw httpError(404, `Phone(s) not found: ${missingSlugs.join(", ")}`);
  }

  const orderedProducts = slugs.map((slug) => productsBySlug.get(slug));
  res.json({
    success: true,
    data: {
      phones: orderedProducts.map(toComparisonPhone),
      specificationGroups: normalizeComparison(orderedProducts),
    },
  });
}

function parseSlugs(queryValue) {
  if (typeof queryValue !== "string" || !queryValue.trim()) {
    throw httpError(400, "slugs query parameter is required");
  }

  const slugs = queryValue.split(",").map((slug) => slug.trim().toLowerCase());
  if (slugs.length < 2) throw httpError(400, "Select at least 2 phones to compare");
  if (slugs.length > 4) throw httpError(400, "You can compare up to 4 phones");
  if (slugs.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
    throw httpError(400, "slugs must be comma-separated valid phone slugs");
  }
  if (new Set(slugs).size !== slugs.length) {
    throw httpError(400, "slugs must not contain duplicates");
  }
  return slugs;
}

function toComparisonPhone(product) {
  const phone = product.data?.phone || {};
  const marketStatus = product.marketStatus || phone.marketStatus || null;
  const priceStatus = phone.priceStatus ?? null;
  return {
    _id: product._id,
    slug: product.slug,
    name: phone.name || product.name,
    brand: product.brand?.name || phone.brand || null,
    image: phone.image ?? null,
    price: getAvailablePrice(product.price, phone.price, priceStatus, marketStatus),
    priceStatus,
    marketStatus,
    score: phone.score ?? null,
    releaseDate: phone.releaseDate ?? null,
    variant: phone.variant ?? null,
  };
}

function getAvailablePrice(productPrice, phonePrice, priceStatus, marketStatus) {
  if ([priceStatus, marketStatus].some((status) =>
    typeof status === "string" && status.toLowerCase() === "upcoming")) {
    return null;
  }

  for (const candidate of [productPrice, phonePrice]) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const price = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

module.exports = { comparePhones };
