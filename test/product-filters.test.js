const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const buildProductFilter = require("../src/utils/product-filters");

function findConditions(query, key, results = []) {
  if (!query || typeof query !== "object") return results;
  for (const [currentKey, value] of Object.entries(query)) {
    if (currentKey === key) results.push(value);
    if (value && typeof value === "object") findConditions(value, key, results);
  }
  return results;
}

function findRegex(query, key) {
  const value = findConditions(query, key).find((item) => item instanceof RegExp);
  assert.ok(value, `expected a regular expression for ${key}`);
  return value;
}

test("all supplied optional filters are combined", () => {
  const filter = buildProductFilter({
    price_min: "15000",
    price_max: "20000",
    market_status: "discounts",
    battery: "2001-3000-mah",
    chipset_type: "mediatek",
    connectivity: "gps",
    display_size: "above-7-inches",
    ram: "4-gb",
  }, { brandId: "brand-id" });

  assert.deepEqual(findConditions(filter, "brand"), ["brand-id"]);
  assert.deepEqual(findConditions(filter, "price"), [{ $gte: 15000, $lte: 20000 }]);
  assert.deepEqual(findConditions(filter, "filters.battery"), [{ $gte: 2001, $lte: 3000 }]);
  assert.deepEqual(findConditions(filter, "filters.display"), [{ $gt: 7 }]);
  assert.deepEqual(findConditions(filter, "filters.ram"), [4]);
  assert.ok(findRegex(filter, "marketStatus").test("Discounts"));
  assert.ok(findRegex(filter, "data.phone.chipsetType").test("MediaTek Dimensity 6300"));
  assert.ok(findRegex(filter, "data.phone.connectivity").test("GPS, GLONASS"));
});

test("specification filters support common product-data layouts", () => {
  const filter = buildProductFilter({
    battery_type: "lithium-ion-li-ion",
    display_size: "above-7-inches",
    display_type: "tft",
    display_refresh_rate: "60hz",
    network: "4g",
  });

  assert.ok(findConditions(filter, "data.phone.battery.type").length);
  assert.ok(findConditions(filter, "data.phone.display.size").length);
  assert.ok(findConditions(filter, "data.phone.display.type").length);
  assert.ok(findConditions(filter, "data.phone.display.refreshRate").length);
  assert.ok(findConditions(filter, "data.phone.network.technology").length);
  assert.ok(findConditions(filter, "data.specifications").length);
  assert.ok(findConditions(filter, "data.specificationGroups").length);
  assert.ok(findConditions(filter, "title")
    .some((regex) => regex instanceof RegExp && regex.test("Display")));
  assert.ok(findConditions(filter, "data.phone.battery.type")
    .some((regex) => regex instanceof RegExp && regex.test("Li-Ion")));
  assert.ok(findRegex(filter, "data.phone.display.type").test("TFT"));
  assert.ok(findRegex(filter, "data.phone.display.refreshRate").test("60 Hz"));
  assert.ok(findRegex(filter, "data.phone.network.technology").test("4 G"));
  assert.ok(findConditions(filter, "data.phone.network.technology")
    .some((regex) => regex instanceof RegExp && regex.test("LTE")));
});

test("official and unofficial price status are filterable", () => {
  const official = buildProductFilter({ price_status: "official" });
  const unofficial = buildProductFilter({ price_status: "unofficial" });

  assert.ok(findRegex(official, "data.phone.priceStatus").test("Official"));
  assert.ok(findRegex(unofficial, "data.phone.priceStatus").test("Unofficial"));
  assert.throws(
    () => buildProductFilter({ price_status: "upcoming" }),
    { status: 400 }
  );
});

test("network arrays, connectivity labels, and SIM Slot values are matched", () => {
  const filter = buildProductFilter({
    network: "4g",
    connectivity: "wifi",
    sim: "dual-sim",
  });

  const labelRegexes = findConditions(filter, "label")
    .filter((value) => value instanceof RegExp);
  const valueRegexes = findConditions(filter, "value")
    .filter((value) => value instanceof RegExp);

  assert.ok(labelRegexes.some((regex) => regex.test("Network")));
  assert.ok(valueRegexes.some((regex) => regex.test("4G")));
  assert.ok(labelRegexes.some((regex) => regex.test("Wi-Fi")));
  assert.ok(labelRegexes.some((regex) => regex.test("WLAN")));
  assert.ok(labelRegexes.some((regex) => regex.test("SIM Slot")));
  assert.ok(valueRegexes.some((regex) => regex.test("Dual SIM, GSM+GSM")));
});

test("filter query structure matches the provided product response shape", () => {
  const response = JSON.parse(readFileSync(path.join(__dirname, "..", "response.json"), "utf8"));
  const product = response.data;
  const productData = product.data;
  const groupItems = productData.specificationGroups.find(
    (group) => group.title === "Network & Connectivity"
  ).items;
  const networkValue = groupItems.find((item) => item.label === "Network").value;
  const simValue = groupItems.find((item) => item.label === "SIM Slot").value;
  const batteryGroup = productData.specificationGroups.find(
    (group) => group.title === "Battery"
  );
  const batteryType = batteryGroup.items.find((item) => item.label === "Battery type").value;

  const networkFilter = buildProductFilter({ network: "4g" });
  const simFilter = buildProductFilter({ sim: "dual-sim" });
  const batteryFilter = buildProductFilter({ battery_type: "lithium-ion-li-ion" });
  const networkPatterns = findConditions(networkFilter, "value").filter(
    (value) => value instanceof RegExp
  );
  const simPatterns = findConditions(simFilter, "value").filter(
    (value) => value instanceof RegExp
  );
  const batteryPatterns = findConditions(batteryFilter, "value").filter(
    (value) => value instanceof RegExp
  );

  assert.ok(findConditions(networkFilter, "items").some((condition) => condition.$elemMatch));
  assert.ok(networkPatterns.some((pattern) => pattern.test(networkValue)));
  assert.ok(simPatterns.some((pattern) => pattern.test(simValue)));
  assert.ok(batteryPatterns.some((pattern) => pattern.test(batteryType)));
  assert.equal(product.filters.display, 6.78);
  assert.equal(productData.specificationGroups.some((group) =>
    Array.isArray(group.items) &&
    group.items.some((item) => /display type|refresh rate/i.test(item.label))
  ), false);
});

test("omitted filters do not add constraints", () => {
  assert.deepEqual(buildProductFilter({ page: "1", limit: "10" }), {});
});

test("price and numeric ranges reject invalid input", () => {
  assert.throws(
    () => buildProductFilter({ price_min: "20000", price_max: "15000" }),
    { status: 400 }
  );
  assert.throws(
    () => buildProductFilter({ battery: "3000-2000-mah" }),
    { status: 400 }
  );
  assert.throws(
    () => buildProductFilter({ price_min: "not-a-price" }),
    { status: 400 }
  );
});
