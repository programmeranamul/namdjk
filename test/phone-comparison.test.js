const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const Product = require("../src/models/product");
const app = require("../src/app");
const { normalizeComparison } = require("../src/utils/phone-comparison");

const onePlus = {
  _id: "oneplus-id",
  slug: "oneplus-21",
  name: "OnePlus 21",
  brand: { name: "OnePlus" },
  price: 130000,
  marketStatus: "Available",
  data: {
    phone: {
      name: "OnePlus 21",
      image: "/oneplus.webp",
      score: 88,
      releaseDate: "12 October 2026",
      variant: "12GB+256GB",
      priceStatus: "Official",
    },
    specificationGroups: [{
      title: "Display",
      items: [{ label: "Screen Size", value: "6.78 inches" }],
    }, {
      title: "Memory",
      items: [{ label: "RAM", value: "12 GB" }, { label: "Internal Storage", value: "256 GB" }],
    }, {
      title: "Cameras",
      subgroups: [{
        title: "Primary Camera",
        items: [
          { label: "Resolution", value: "200 MP" },
          { label: "Autofocus", value: "Yes" },
          { label: "OIS", value: "Yes" },
        ],
      }, {
        title: "Selfie Camera",
        items: [{ label: "Resolution", value: "50 MP" }],
      }],
    }],
  },
};

const samsung = {
  _id: "samsung-id",
  slug: "samsung-s26",
  name: "Samsung S26",
  brand: { name: "Samsung" },
  price: 0,
  marketStatus: "Upcoming",
  data: {
    phone: {
      name: "Samsung S26",
      image: "/samsung.webp",
      score: 90,
      price: 0,
      priceStatus: "Upcoming",
      variantPrice: 120000,
    },
    specificationGroups: [{
      title: "Display",
      items: [{ label: "Display Size", value: "6.7 inches" }],
    }, {
      title: "Cameras",
      subgroups: [{
        title: "Primary Camera",
        items: [{ label: "Resolution", value: "50 MP" }],
      }],
    }],
  },
};

test("comparison normalization unifies labels and splits nested camera specs into groups", () => {
  const groups = normalizeComparison([onePlus, samsung]);
  const display = groups.find((group) => group.key === "display");
  const memory = groups.find((group) => group.key === "memory");
  const primaryCamera = groups.find((group) => group.key === "primaryCamera");
  const selfieCamera = groups.find((group) => group.key === "selfieCamera");

  assert.deepEqual(display.items.find((item) => item.key === "displaySize").values, [
    "6.78 inches",
    "6.7 inches",
  ]);
  assert.deepEqual(memory.items.find((item) => item.key === "ram").values, [
    "12 GB",
    "Not specified",
  ]);
  assert.deepEqual(primaryCamera.items.find((item) =>
    item.key === "resolution").values, ["200 MP", "50 MP"]);
  assert.deepEqual(primaryCamera.items.find((item) =>
    item.key === "autofocus").values, ["Yes", "Not specified"]);
  assert.deepEqual(primaryCamera.items.find((item) =>
    item.key === "ois").values, ["Yes", "Not specified"]);
  assert.deepEqual(selfieCamera.items.find((item) =>
    item.key === "resolution").values, ["50 MP", "Not specified"]);
});

test("comparison endpoint queries once and preserves the requested phone order", async () => {
  const originalFind = Product.find;
  const queryCalls = [];
  Product.find = (filter) => {
    queryCalls.push(filter);
    return {
      select() {
        return this;
      },
      populate() {
        return this;
      },
      async lean() {
        return [samsung, onePlus];
      },
    };
  };

  const server = app.listen(0);
  try {
    await once(server, "listening");
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/phones/compare?slugs=oneplus-21,samsung-s26`
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data.phones.map((phone) => phone.slug), [
      "oneplus-21",
      "samsung-s26",
    ]);
    assert.equal(body.data.phones[1].price, null);
    assert.equal(queryCalls.length, 1);
    assert.deepEqual(queryCalls[0], { slug: { $in: ["oneplus-21", "samsung-s26"] } });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    Product.find = originalFind;
  }
});

test("comparison endpoint validates slug count, format, duplicates, and missing phones", async () => {
  const originalFind = Product.find;
  let queryCount = 0;
  Product.find = () => {
    queryCount += 1;
    return {
      select() {
        return this;
      },
      populate() {
        return this;
      },
      async lean() {
        return [onePlus];
      },
    };
  };

  const server = app.listen(0);
  try {
    await once(server, "listening");
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}/api/phones/compare`;

    for (const [query, expectedStatus] of [
      ["", 400],
      ["?slugs=oneplus-21", 400],
      ["?slugs=oneplus-21,samsung-s26,iphone-18,pixel-11,oppo-find", 400],
      ["?slugs=oneplus-21,oneplus-21", 400],
      ["?slugs=oneplus-21,bad%20slug", 400],
    ]) {
      const response = await fetch(`${base}${query}`);
      const body = await response.json();
      assert.equal(response.status, expectedStatus, JSON.stringify(body));
      assert.equal(typeof body.error, "string");
    }

    const queryCountAfterInvalidInput = queryCount;
    const missingResponse = await fetch(`${base}?slugs=oneplus-21,samsung-s26`);
    const missingBody = await missingResponse.json();
    assert.equal(missingResponse.status, 404);
    assert.match(missingBody.error, /samsung-s26/);
    assert.equal(queryCount, queryCountAfterInvalidInput + 1);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    Product.find = originalFind;
  }
});
