const express = require("express");
const phoneComparisonController = require("../controllers/phone-comparison-controller");

const router = express.Router();

router.get("/compare", (req, res, next) => {
  Promise.resolve(phoneComparisonController.comparePhones(req, res)).catch(next);
});

module.exports = router;
