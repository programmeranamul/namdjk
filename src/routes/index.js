const express = require("express");
const brandController = require("../controllers/brand-controller");
const latestComparisonController = require("../controllers/latest-comparison-controller");
const productController = require("../controllers/product-controller");
const reviewController = require("../controllers/review-controller");

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

router.get("/brands", asyncHandler(brandController.listBrands));
router.post("/brands", asyncHandler(brandController.createBrand));
router.get("/brands/:slug", asyncHandler(brandController.getBrand));
router.patch("/brands/:slug", asyncHandler(brandController.updateBrand));
router.delete("/brands/:slug", asyncHandler(brandController.deleteBrand));

router.post(
  "/latest-comparisons",
  asyncHandler(latestComparisonController.createLatestComparison)
);
router.get(
  "/latest-comparisons",
  asyncHandler(latestComparisonController.listLatestComparisons)
);

router.get("/products", asyncHandler(productController.listProducts));
router.get("/products/latest", asyncHandler(productController.listLatestProducts));
router.get("/products/official-phone", asyncHandler(productController.listOfficialPhones));
router.get("/products/unofficial-phone", asyncHandler(productController.listUnofficialPhones));
router.get("/products/upcoming-phone", asyncHandler(productController.listUpcomingPhones));
router.post("/products", asyncHandler(productController.createProduct));
router.get("/products/:idOrSlug", asyncHandler(productController.getProduct));
router.patch("/products/:idOrSlug", asyncHandler(productController.updateProduct));
router.delete("/products/:idOrSlug", asyncHandler(productController.deleteProduct));

router.post("/reviews", asyncHandler(reviewController.createReview));
router.get("/products/:idOrSlug/reviews", asyncHandler(reviewController.listReviews));
router.patch("/reviews/:reviewId", asyncHandler(reviewController.updateReview));
router.delete("/reviews/:reviewId", asyncHandler(reviewController.deleteReview));

module.exports = router;
