const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const Brand = require("../src/models/brand");
const Product = require("../src/models/product");
const app = require("../src/app");

test("product list endpoints apply optional filters to find and count", async () => {
  const originalFind = Product.find;
  const originalCountDocuments = Product.countDocuments;
  const originalBrandFindOne = Brand.findOne;
  let findFilter;
  let countFilter;
  const sortCalls = [];

  Brand.findOne = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: "brand-id" };
    },
  });
  Product.find = (filter) => {
    findFilter = filter;
    return {
      select() { return this; },
      populate() { return this; },
      sort(sort) {
        sortCalls.push(sort);
        return this;
      },
      skip() { return this; },
      limit() { return this; },
      async lean() { return []; },
    };
  };
  Product.countDocuments = async (filter) => {
    countFilter = filter;
    return 0;
  };

  const server = app.listen(0);
  try {
    await once(server, "listening");
    const address = server.address();
    const filters = new URLSearchParams({
      page: "1",
      limit: "10",
      price_min: "15000",
      price_max: "20000",
      market_status: "discounts",
      price_status: "official",
      brand: "apple",
      battery: "2001-3000-mah",
      camera_resolution: "48mp",
      chipset_type: "mediatek",
      connectivity: "gps",
      display_size: "above-7-inches",
      network: "4g",
      os: "android",
      ram: "4-gb",
      sim: "dual-sim",
      storage: "64-gb",
      battery_type: "lithium-ion-li-ion",
      display_type: "tft",
      display_refresh_rate: "60hz",
    });

    for (const endpoint of [
      "/api/v1/products",
      "/api/v1/products/latest",
      "/api/v1/products/official-phone",
      "/api/v1/products/unofficial-phone",
      "/api/v1/products/upcoming-phone",
    ]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${endpoint}?${filters}`);
      const body = await response.json();
      assert.equal(response.status, 200, `${endpoint}: ${JSON.stringify(body)}`);
      assert.deepEqual(body.pagination, { page: 1, limit: 10, total: 0, pages: 0 });
      assert.deepEqual(findFilter, countFilter);
      assert.equal(sortCalls.length, 0, `${endpoint} should not sort by default`);
      assert.ok(findConditions(findFilter, "filters.battery").length, endpoint);
      assert.ok(findConditions(findFilter, "data.phone.priceStatus").length, endpoint);
      assert.ok(findConditions(findFilter, "data.phone.chipsetType").length, endpoint);
      assert.ok(findConditions(findFilter, "data.phone.displayRefreshRate").length, endpoint);
    }

    const highToLow = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/products/latest?sort=price_high_to_low`
    );
    assert.equal(highToLow.status, 200);
    assert.deepEqual(sortCalls[sortCalls.length - 1], { price: -1 });

    const lowToHigh = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/products/latest?sort=price_low_to_high`
    );
    assert.equal(lowToHigh.status, 200);
    assert.deepEqual(sortCalls[sortCalls.length - 1], { price: 1 });

    const invalidSort = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/products/latest?sort=unknown`
    );
    assert.equal(invalidSort.status, 400);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    Product.find = originalFind;
    Product.countDocuments = originalCountDocuments;
    Brand.findOne = originalBrandFindOne;
  }
});

test("product creation extracts display size from a Display group", async () => {
  const originalCreate = Product.create;
  const originalBrandFindOne = Brand.findOne;
  let createdProduct;

  Brand.findOne = async () => ({ _id: "brand-id" });
  Product.create = async (document) => {
    createdProduct = document;
    return {
      async populate() {
        return document;
      },
    };
  };

  const server = app.listen(0);
  try {
    await once(server, "listening");
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brand: "Apple",
        data: {
          phone: { name: "Example Phone" },
          specificationGroups: [{
            title: "Display",
            specifications: [{ label: "Size", value: "7.2 inches" }],
          }],
        },
      }),
    });

    assert.equal(response.status, 201);
    assert.equal(createdProduct.filters.display, 7.2);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    Product.create = originalCreate;
    Brand.findOne = originalBrandFindOne;
  }
});

function findConditions(query, key, results = []) {
  if (!query || typeof query !== "object") return results;
  for (const [currentKey, value] of Object.entries(query)) {
    if (currentKey === key) results.push(value);
    if (value && typeof value === "object") findConditions(value, key, results);
  }
  return results;
}
