const MISSING_VALUE = "Not specified";

const GROUPS = [
  { key: "general", title: "General", aliases: ["general"] },
  {
    key: "hardwareSoftware",
    title: "Hardware & Software",
    aliases: ["hardwaresoftware", "hardwareandsoftware", "software"],
  },
  { key: "display", title: "Display", aliases: ["display", "screen"] },
  { key: "cameras", title: "Cameras", aliases: ["camera", "cameras"] },
  { key: "primaryCamera", title: "Primary Camera", aliases: ["primarycamera", "maincamera", "rearcamera"] },
  { key: "selfieCamera", title: "Selfie Camera", aliases: ["selfiecamera", "frontcamera"] },
  { key: "design", title: "Design", aliases: ["design", "body"] },
  { key: "battery", title: "Battery", aliases: ["battery"] },
  { key: "memory", title: "Memory", aliases: ["memory", "storage"] },
  {
    key: "networkConnectivity",
    title: "Network & Connectivity",
    aliases: ["networkconnectivity", "connectivity"],
  },
  {
    key: "sensorsSecurity",
    title: "Sensors & Security",
    aliases: ["sensorssecurity", "sensorsandsecurity", "security"],
  },
  { key: "multimedia", title: "Multimedia", aliases: ["multimedia", "audio"] },
  { key: "more", title: "More", aliases: ["more", "other"] },
];

const GROUP_BY_ALIAS = new Map(
  GROUPS.flatMap((group) => group.aliases.map((alias) => [alias, group]))
);

const LABEL_ALIASES = new Map([
  ["brand", "brand"],
  ["model", "model"],
  ["devicetype", "deviceType"],
  ["releasedate", "releaseDate"],
  ["launchdate", "releaseDate"],
  ["status", "status"],
  ["operatingsystem", "operatingSystem"],
  ["os", "operatingSystem"],
  ["screensize", "displaySize"],
  ["displaysize", "displaySize"],
  ["display", "displaySize"],
  ["size", "displaySize"],
  ["internalstorage", "storage"],
  ["storage", "storage"],
  ["rom", "storage"],
  ["ram", "ram"],
  ["ramcapacity", "ram"],
  ["resolution", "resolution"],
  ["maincamera", "mainCamera"],
  ["rearcamera", "mainCamera"],
  ["primarycamera", "primaryCamera"],
  ["frontcamera", "selfieCamera"],
  ["selfiecamera", "selfieCamera"],
  ["batterycapacity", "batteryCapacity"],
  ["capacity", "batteryCapacity"],
  ["batterytype", "batteryType"],
]);

const KNOWN_LABELS = {
  brand: "Brand",
  model: "Model",
  deviceType: "Device Type",
  releaseDate: "Release Date",
  status: "Status",
  operatingSystem: "Operating System",
  displaySize: "Display Size",
  resolution: "Resolution",
  storage: "Internal Storage",
  ram: "RAM",
  mainCamera: "Main Camera",
  primaryCamera: "Primary Camera",
  selfieCamera: "Selfie Camera",
  batteryCapacity: "Battery Capacity",
  batteryType: "Battery Type",
};

function normalizeComparison(phones) {
  const groupedItems = new Map();

  for (const [phoneIndex, phone] of phones.entries()) {
    for (const specification of flattenSpecifications(phone)) {
      const { group, key, label, value } = specification;
      if (!groupedItems.has(group.key)) {
        groupedItems.set(group.key, { group, items: new Map() });
      }

      const groupItems = groupedItems.get(group.key).items;
      if (!groupItems.has(key)) {
        groupItems.set(key, { key, label, values: Array(phones.length).fill(MISSING_VALUE) });
      }

      const item = groupItems.get(key);
      if (item.values[phoneIndex] === MISSING_VALUE && value !== MISSING_VALUE) {
        item.values[phoneIndex] = value;
      }
    }
  }

  return [...groupedItems.values()]
    .sort((left, right) => groupOrder(left.group) - groupOrder(right.group))
    .map(({ group, items }) => ({
      key: group.key,
      title: group.title,
      items: [...items.values()],
    }));
}

function flattenSpecifications(product) {
  const data = isObject(product?.data) ? product.data : {};
  const specifications = [];
  const sourceGroups = Array.isArray(data.specificationGroups) ? data.specificationGroups : [];

  for (const sourceGroup of sourceGroups) {
    const groupTitle = readGroupTitle(sourceGroup);
    if (!groupTitle) continue;

    for (const item of readItems(sourceGroup)) {
      addSpecification(specifications, item, groupTitle);
    }

    for (const subgroup of Array.isArray(sourceGroup.subgroups) ? sourceGroup.subgroups : []) {
      const subgroupTitle = readGroupTitle(subgroup);
      if (!subgroupTitle) continue;
      for (const item of readItems(subgroup)) {
        addSpecification(specifications, item, groupTitle, subgroupTitle);
      }
    }
  }

  for (const item of [
    ...(Array.isArray(data.quickSpecifications) ? data.quickSpecifications : []),
    ...(Array.isArray(data.fullSpecificationPreview) ? data.fullSpecificationPreview : []),
  ]) {
    addSpecification(specifications, item, inferGroup(item));
  }

  return specifications;
}

function addSpecification(results, item, groupTitle, subgroupTitle) {
  if (!isObject(item)) return;
  const sourceLabel = firstString(item.label, item.name, item.key);
  if (!sourceLabel) return;

  const parentGroup = resolveGroup(groupTitle);
  const subgroupKey = subgroupTitle ? normalizeToken(subgroupTitle) : "";
  const cameraGroup = parentGroup.key === "cameras" ? getCameraGroup(subgroupKey) : null;
  const group = cameraGroup || parentGroup;
  const baseKey = normalizeLabel(sourceLabel, group);
  const key = baseKey;
  const label = labelFor(baseKey, sourceLabel);
  const value = normalizeValue(item.value);

  results.push({ group, key, label, value });
}

function readItems(group) {
  if (Array.isArray(group?.items)) return group.items;
  if (Array.isArray(group?.specifications)) return group.specifications;
  if (Array.isArray(group?.specs)) return group.specs;
  return [];
}

function readGroupTitle(group) {
  return firstString(group?.title, group?.name, group?.label, group?.group);
}

function inferGroup(item) {
  const label = normalizeToken(firstString(item?.label, item?.name, item?.key));
  if (["brand", "model", "devicetype", "releasedate", "launchdate", "status"].includes(label)) {
    return "General";
  }
  if (["operatingsystem", "os", "chipset", "cpu", "processor", "osversion"].includes(label)) {
    return "Hardware & Software";
  }
  if (["screensize", "displaysize", "display", "resolution", "refreshrate"].includes(label)) {
    return "Display";
  }
  if (/camera|selfie|rearcamera|frontcamera/.test(label)) return "Cameras";
  if (/ram|storage|rom/.test(label)) return "Memory";
  if (/battery|charging/.test(label)) return "Battery";
  if (/network|sim|wifi|wlan|bluetooth|gps|connectivity/.test(label)) {
    return "Network & Connectivity";
  }
  return "More";
}

function normalizeLabel(label, group) {
  const compact = normalizeToken(label);
  if (LABEL_ALIASES.has(compact)) {
    let key = LABEL_ALIASES.get(compact);
    if (compact === "size" && group.key !== "display") return toCamelCase(label);
    if (compact === "capacity" && group.key !== "battery") return toCamelCase(label);
    if (compact === "resolution" && group.key === "cameras") return "resolution";
    if (group.key === "cameras" && key === "mainCamera") key = "primaryCamera";
    return key;
  }
  return toCamelCase(label);
}

function resolveGroup(title) {
  const normalized = normalizeToken(title);
  return GROUP_BY_ALIAS.get(normalized) || {
    key: toCamelCase(title),
    title: title.trim(),
    aliases: [],
  };
}

function getCameraGroup(subgroupKey) {
  if (["primarycamera", "maincamera", "rearcamera"].includes(subgroupKey)) {
    return GROUP_BY_ALIAS.get("primarycamera");
  }
  if (["selfiecamera", "frontcamera"].includes(subgroupKey)) {
    return GROUP_BY_ALIAS.get("selfiecamera");
  }
  return null;
}

function labelFor(key, sourceLabel) {
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  if (key === "ois") return "OIS";
  return sourceLabel.trim();
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return MISSING_VALUE;
  if (Array.isArray(value)) {
    const values = value.map(normalizeValue).filter((entry) => entry !== MISSING_VALUE);
    return values.length ? values.join(", ") : MISSING_VALUE;
  }
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return MISSING_VALUE;
}

function normalizeToken(value) {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

function toCamelCase(value) {
  const words = String(value).match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) || [String(value)];
  return words
    .map((word) => word.toLowerCase())
    .reduce((result, word, index) =>
      index === 0 ? word : result + capitalize(word), "");
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function groupOrder(group) {
  const index = GROUPS.findIndex((entry) => entry.key === group.key);
  return index === -1 ? GROUPS.length : index;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim());
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

module.exports = { normalizeComparison, MISSING_VALUE };
