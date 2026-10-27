const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const LatestComparison = require("../src/models/latest-comparison");
const app = require("../src/app");

const comparisonInput = {
  phone1: {
    name: "Apple iPhone 16 Pro Max",
    price: "৳249,999",
    score: "89%",
    image: "/images/phones/mob.webp",
    slug: "apple-iphone-16-pro-max",
  },
  phone2: {
    name: "Apple iPhone 17 Pro Max",
    price: "৳199,999",
    score: "90%",
    image: "/images/phones/mob.webp",
    slug: "apple-iphone-17-pro-max",
  },
};

test("latest comparison creation validates and stores both phones", async () => {
  const originalCreate = LatestComparison.create;
  let created;
  LatestComparison.create = async (document) => {
    created = document;
    return { _id: "comparison-id", ...document };
  };

  const server = app.listen(0);
  try {
    await once(server, "listening");
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/latest-comparisons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(comparisonInput),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(created, comparisonInput);
    assert.deepEqual((await response.json()).data.phone1, comparisonInput.phone1);

    const invalidResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/latest-comparisons`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...comparisonInput,
          phone2: { ...comparisonInput.phone2, slug: "" },
        }),
      }
    );
    assert.equal(invalidResponse.status, 400);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    LatestComparison.create = originalCreate;
  }
});

test("latest comparisons are returned newest-first with pagination", async () => {
  const originalFind = LatestComparison.find;
  const originalCountDocuments = LatestComparison.countDocuments;
  const sortCalls = [];
  const paginationCalls = [];
  LatestComparison.find = () => ({
    sort(sort) {
      sortCalls.push(sort);
      return this;
    },
    skip(skip) {
      paginationCalls.push(["skip", skip]);
      return this;
    },
    limit(limit) {
      paginationCalls.push(["limit", limit]);
      return this;
    },
    async lean() {
      return [comparisonInput];
    },
  });
  LatestComparison.countDocuments = async () => 21;

  const server = app.listen(0);
  try {
    await once(server, "listening");
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/latest-comparisons?page=2&limit=10`
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, [comparisonInput]);
    assert.deepEqual(body.pagination, { page: 2, limit: 10, total: 21, pages: 3 });
    assert.deepEqual(sortCalls, [{ createdAt: -1 }]);
    assert.deepEqual(paginationCalls, [["skip", 10], ["limit", 10]]);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    LatestComparison.find = originalFind;
    LatestComparison.countDocuments = originalCountDocuments;
  }
});
