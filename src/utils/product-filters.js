const httpError = require("./http-error");

const SPEC_FILTERS = {
  battery: {
    labels: ["battery", "battery capacity"],
    fields: ["battery"],
    numericFilter: "battery",
  },
  battery_type: {
    labels: ["battery type", "battery technology", "battery"],
    fields: ["batteryType", "battery.type", "batteryTechnology"],
    valueAliases: [/lithium[\s_-]*ion/i, /li[\s_-]*ion/i],
    groupLabels: ["Battery"],
    groupItemLabels: ["Battery type", "Battery technology", "Type"],
  },
  camera_resolution: {
    labels: ["camera resolution", "main camera", "rear camera", "primary camera"],
    fields: ["cameraResolution", "mainCamera"],
    numericFilter: "mainCamera",
  },
  chipset_type: {
    labels: ["chipset", "chipset type", "processor", "soc"],
    fields: ["chipset", "chipsetType", "processor"],
  },
  connectivity: {
    labels: ["connectivity", "gps", "positioning"],
    fields: ["connectivity", "network.connectivity"],
    matchLabelFromQuery: true,
    groupLabels: ["Network & Connectivity"],
  },
  display_refresh_rate: {
    labels: ["display refresh rate", "refresh rate"],
    fields: ["displayRefreshRate", "refreshRate", "display.refreshRate"],
    groupLabels: ["display", "screen"],
    groupItemLabels: ["refresh rate", "display refresh rate"],
  },
  display_size: {
    labels: ["display size", "screen size", "display", "size"],
    fields: ["displaySize", "display.size", "screenSize"],
    numericFilter: "display",
    groupLabels: ["display", "screen"],
    groupItemLabels: ["size", "display size", "screen size"],
  },
  display_type: {
    labels: ["display type", "screen type", "display technology", "panel type"],
    fields: ["displayType", "screenType", "display.type", "display.technology"],
    groupLabels: ["display", "screen"],
    groupItemLabels: ["type", "display type", "screen type", "technology"],
  },
  network: {
    labels: [
      "network",
      "network technology",
      "network type",
      "technology",
      "2g bands",
      "3g bands",
      "4g bands",
      "5g bands",
    ],
    fields: ["network", "networkTechnology", "network.type", "network.technology"],
    groupLabels: ["Network & Connectivity"],
    groupItemLabels: ["Network"],
  },
  os: {
    labels: ["os", "operating system"],
    fields: ["os", "operatingSystem"],
  },
  ram: {
    labels: ["ram", "memory"],
    fields: ["ram"],
    numericFilter: "ram",
  },
  sim: {
    labels: ["sim", "sim type", "sim slot"],
    fields: ["sim", "simType", "simSlot"],
    groupLabels: ["Network & Connectivity"],
    groupItemLabels: ["SIM Slot", "SIM", "SIM type"],
  },
  storage: {
    labels: ["storage", "internal storage"],
    fields: ["storage"],
    numericFilter: "storage",
  },
};

const NUMERIC_FILTERS = {
  camera: "mainCamera",
  display: "display",
  frontCamera: "frontCamera",
  mainCamera: "mainCamera",
};

const NETWORK_ALIASES = {
  "2g": /\bGSM\b/i,
  "3g": /\bHSPA\b/i,
  "4g": /\bLTE\b/i,
  "5g": /\b(?:5G|NR)\b/i,
};

const CONNECTIVITY_LABEL_ALIASES = {
  gps: ["gps", "positioning"],
  wifi: ["wifi", "wi-fi", "wlan"],
  hotspot: ["hotspot", "wi-fi hotspot", "mobile hotspot"],
};

function buildProductFilter(query, options = {}) {
  const conditions = [];

  if (options.brandId) conditions.push({ brand: options.brandId });
  if (query.slug) conditions.push({ slug: String(query.slug).toLowerCase() });
  if (query.name) {
    conditions.push({ name: new RegExp(escapeRegex(String(query.name)), "i") });
  }

  const priceRange = {};
  if (query.price_min !== undefined) {
    priceRange.$gte = parseNonNegativeNumber(query.price_min, "price_min");
  }
  if (query.price_max !== undefined) {
    priceRange.$lte = parseNonNegativeNumber(query.price_max, "price_max");
  }
  if (priceRange.$gte !== undefined && priceRange.$lte !== undefined &&
      priceRange.$gte > priceRange.$lte) {
    throw httpError(400, "price_min must not be greater than price_max");
  }
  if (Object.keys(priceRange).length) {
    conditions.push({
      $or: [
        { price: priceRange },
        { "data.phone.price": priceRange },
      ],
    });
  }

  if (query.market_status !== undefined) {
    const status = toFlexibleRegex(query.market_status, "market_status");
    conditions.push({
      $or: [
        { marketStatus: status },
        { "data.phone.marketStatus": status },
        { "data.phone.priceStatus": status },
      ],
    });
  }

  if (query.price_status !== undefined) {
    const priceStatus = String(query.price_status).trim().toLowerCase();
    if (!["official", "unofficial"].includes(priceStatus)) {
      throw httpError(400, "price_status must be either official or unofficial");
    }
    conditions.push({
      "data.phone.priceStatus": new RegExp(`^${escapeRegex(priceStatus)}$`, "i"),
    });
  }

  for (const [queryField, filterField] of Object.entries(NUMERIC_FILTERS)) {
    if (query[queryField] !== undefined) {
      const value = parseNonNegativeNumber(query[queryField], queryField);
      conditions.push({ [`filters.${filterField}`]: value });
    }
  }

  for (const [queryField, config] of Object.entries(SPEC_FILTERS)) {
    if (query[queryField] === undefined) continue;

    const value = String(query[queryField]).trim();
    if (!value) throw httpError(400, `${queryField} must not be empty`);

    const alternatives = buildSpecificationAlternatives(config, value, queryField);
    conditions.push({ $or: alternatives });
  }

  return conditions.length ? { $and: conditions } : {};
}

function buildSpecificationAlternatives(config, value, queryField) {
  const alternatives = [];
  const numericMatch = config.numericFilter
    ? parseNumericMatch(value, queryField)
    : null;

  if (numericMatch !== null) {
    alternatives.push({ [`filters.${config.numericFilter}`]: numericMatch });
  }

  const labelRegex = new RegExp(
    `^(?:${config.labels.map(escapeRegex).join("|")})$`,
    "i"
  );
  const labelRegexes = [labelRegex];
  if (config.matchLabelFromQuery) {
    const requestedLabels = getConnectivityLabels(value);
    labelRegexes.push(
      new RegExp(`(?:${requestedLabels.map(escapeRegex).join("|")})`, "i")
    );
  }
  const valueRegexes = [
    toFlexibleRegex(value, queryField),
    ...(config.valueAliases || []),
    ...getNetworkAliases(queryField, value),
  ];
  const specificationMatch = {
    $elemMatch: {
      $and: [
        {
          $or: [
            ...labelRegexes.flatMap((regex) => [
              { label: regex },
              { name: regex },
              { key: regex },
              { title: regex },
            ]),
          ],
        },
        {
          $or: valueRegexes.flatMap((valueRegex) => [
            { value: valueRegex },
            { values: valueRegex },
          ]),
        },
      ],
    },
  };
  alternatives.push({ "data.quickSpecifications": specificationMatch });
  alternatives.push({ "data.specificationGroups.specifications": specificationMatch });
  alternatives.push({ "data.specificationGroups.specs": specificationMatch });
  alternatives.push({ "data.specifications": specificationMatch });
  if (config.groupLabels) {
    const groupTitleRegex = new RegExp(
      `^(?:${config.groupLabels.map(escapeRegex).join("|")})$`,
      "i"
    );
    const itemLabelRegexes = config.matchLabelFromQuery
      ? getConnectivityLabels(value).map((label) => new RegExp(`^${escapeRegex(label)}$`, "i"))
      : (config.groupItemLabels || config.labels).map(
        (label) => new RegExp(`^${escapeRegex(label)}$`, "i")
      );
    const itemConditions = [
      {
        $or: itemLabelRegexes.flatMap((regex) => [
          { label: regex },
          { name: regex },
          { key: regex },
          { title: regex },
        ]),
      },
    ];

    if (!config.matchLabelFromQuery) {
      itemConditions.push({
        $or: valueRegexes.flatMap((valueRegex) => [
          { value: valueRegex },
          { values: valueRegex },
        ]),
      });
    }

    alternatives.push({
      "data.specificationGroups": {
        $elemMatch: {
          $and: [
            {
              $or: [
                { title: groupTitleRegex },
                { name: groupTitleRegex },
                { label: groupTitleRegex },
              ],
            },
            {
              $or: [
                { items: { $elemMatch: { $and: itemConditions } } },
                {
                  subgroups: {
                    $elemMatch: {
                      $or: [
                        { items: { $elemMatch: { $and: itemConditions } } },
                        { specifications: { $elemMatch: { $and: itemConditions } } },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    });
  }
  if (config.matchLabelFromQuery) {
    const requestedLabels = getConnectivityLabels(value);
    const connectivityLabelMatch = {
      $elemMatch: {
        $or: requestedLabels.flatMap((label) => {
          const regex = new RegExp(escapeRegex(label), "i");
          return [
            { label: regex },
            { name: regex },
            { key: regex },
            { title: regex },
          ];
        }),
      },
    };
    alternatives.push({ "data.quickSpecifications": connectivityLabelMatch });
    alternatives.push({ "data.specificationGroups.specifications": connectivityLabelMatch });
    alternatives.push({ "data.specificationGroups.specs": connectivityLabelMatch });
    alternatives.push({ "data.specifications": connectivityLabelMatch });
  }

  for (const field of config.fields) {
    for (const valueRegex of valueRegexes) {
      alternatives.push({ [`data.phone.${field}`]: valueRegex });
      alternatives.push({ [`data.${field}`]: valueRegex });
    }
  }

  function getNetworkAliases(queryField, value) {
    if (queryField !== "network") return [];
    const alias = NETWORK_ALIASES[value.trim().toLowerCase()];
    return alias
      ? [alias]
      : [];
  }

  function getConnectivityLabels(value) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const aliases = CONNECTIVITY_LABEL_ALIASES[normalized];
    return aliases || [value.trim()];
  }

  return alternatives;
}

function parseNumericMatch(value, field) {
  const normalized = String(value).trim().toLowerCase();
  const range = normalized.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?:-[a-z]+)*$/);
  if (range) {
    const minimum = Number(range[1]);
    const maximum = Number(range[2]);
    if (minimum > maximum) throw httpError(400, `${field} range minimum must not exceed maximum`);
    return { $gte: minimum, $lte: maximum };
  }

  const above = normalized.match(/^above-(\d+(?:\.\d+)?)(?:-[a-z]+)*$/);
  if (above) return { $gt: Number(above[1]) };

  const below = normalized.match(/^below-(\d+(?:\.\d+)?)(?:-[a-z]+)*$/);
  if (below) return { $lt: Number(below[1]) };

  const number = normalized.match(/^\d+(?:\.\d+)?/);
  if (number && /^\d+(?:\.\d+)?[a-z]*(?:-[a-z]+)*$/.test(normalized)) {
    return Number(number[0]);
  }
  throw httpError(400, `${field} must be a number, range, above-N, or below-N`);
}

function parseNonNegativeNumber(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw httpError(400, `${field} must be a non-negative number`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw httpError(400, `${field} must be a non-negative number`);
  }
  return number;
}

function toFlexibleRegex(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw httpError(400, `${field} must not be empty`);
  }
  const normalized = value.trim().replace(/([a-z])(\d)|(\d)([a-z])/gi, "$1$3 $2$4");
  const tokens = normalized.split(/[^a-z0-9.]+/i).filter(Boolean);
  if (!tokens.length) throw httpError(400, `${field} must contain letters or numbers`);
  return new RegExp(tokens.map(escapeRegex).join("[\\s_-]*"), "i");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = buildProductFilter;
