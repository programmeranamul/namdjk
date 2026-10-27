# Mobile product API

An Express and MongoDB API for brands, mobile products, and user reviews. Product detail payloads are kept together in `data`; searchable numeric specifications are extracted into indexed `filters` fields. Reviews are stored separately so their collection can grow independently of product documents.

## Run

Set `MONGODB_URI` to a MongoDB connection string, then run:

```sh
npm start
```

The server uses `PORT` when set and otherwise listens on port `5000`. `GET /health` reports the API and MongoDB connection state.

## Routes

All resource routes use the `/api/v1` prefix.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/brands` | Create a brand |
| `GET` | `/brands` | List brands (`name`, `page`, `limit`) |
| `GET` | `/brands/:slug` | Read a brand |
| `PATCH` | `/brands/:slug` | Update a brand |
| `DELETE` | `/brands/:slug` | Delete a brand with no products |
| `POST` | `/latest-comparisons` | Create a latest phone comparison |
| `GET` | `/latest-comparisons` | List latest comparisons with pagination |
| `GET` | `/phones/compare?slugs=oneplus-16,iphone-16` | Compare 2–4 products by slug |
| `POST` | `/products` | Create a product |
| `GET` | `/products` | Filter and paginate compact product summaries |
| `GET` | `/products/latest` | List newest products with pagination |
| `GET` | `/products/official-phone` | List official phones with pagination |
| `GET` | `/products/unofficial-phone` | List unofficial phones with pagination |
| `GET` | `/products/upcoming-phone` | List upcoming phones with pagination |
| `GET` | `/products/:idOrSlug` | Read a product by Mongo ID or slug |
| `PATCH` | `/products/:idOrSlug` | Update a product |
| `DELETE` | `/products/:idOrSlug` | Delete a product and its reviews |
| `POST` | `/reviews` | Create a review |
| `GET` | `/products/:idOrSlug/reviews` | List reviews and rating summary |
| `PATCH` | `/reviews/:reviewId` | Update a review |
| `DELETE` | `/reviews/:reviewId` | Delete a review |

### Create a product

Create the brand first. Product `data` accepts the mobile detail object (including `phone`, `quickSpecifications`, and `specificationGroups`); `brandId` can be its Mongo ID, or `brand` can be its existing name or slug. A slug is generated from the product name if omitted.

```json
{
  "brand": "OnePlus",
  "data": {
    "phone": {
      "name": "OnePlus 16",
      "price": 130000,
      "marketStatus": "Available",
      "brand": "OnePlus"
    },
    "quickSpecifications": [
      { "label": "RAM", "value": "12GB" },
      { "label": "Storage", "value": "256GB" },
      { "label": "Main Camera", "value": "200+50+50MP" },
      { "label": "Front Camera", "value": "50MP" },
      { "label": "Display", "value": "6.78 inch" },
      { "label": "Battery", "value": "9000mAh" }
    ]
  }
}
```

Pass `filters` to explicitly override extracted numbers. Supported fields are `ram`, `storage`, `mainCamera`, `frontCamera`, `battery`, and `display`.

### Filter products

`GET /api/v1/products?brand=OnePlus&name=OnePlus&ram=12&camera=200&storage=256&battery=9000&page=1&limit=20`

All filters are optional and can be combined. In addition to `name`, `slug`, and `brand`, the product list endpoints accept `price_min`, `price_max`, `market_status`, `price_status`, `battery`, `battery_type`, `camera_resolution`, `chipset_type`, `connectivity`, `display_refresh_rate`, `display_size`, `display_type`, `network`, `os`, `ram`, `sim`, and `storage`. `price_status` accepts `official` or `unofficial`. Price sorting is also optional: use `sort=price_high_to_low` or `sort=price_low_to_high`. If `sort` is omitted, the API does not explicitly sort the results. For example:

`GET /api/v1/products/upcoming-phone?page=1&limit=10&sort=price_high_to_low&price_min=15000&price_max=20000&market_status=discounts&brand=apple&battery=2001-3000-mah&camera_resolution=48mp&chipset_type=mediatek&connectivity=gps&display_size=above-7-inches&network=4g&os=android&ram=4-gb&sim=dual-sim&storage=64-gb&battery_type=lithium-ion-li-ion&display_type=tft&display_refresh_rate=60hz`

Price bounds are inclusive. Numeric specifications accept exact values with optional units (for example, `ram=4-gb`), inclusive ranges (for example, `battery=2001-3000-mah`), and `above-N` or `below-N` bounds (for example, `display_size=above-7-inches`). Category values are matched case-insensitively against phone fields and specification records, including `label`/`name`/`key` specification entries. Grouped product specs are read from `data.specificationGroups[].items[]`. `network=4g` can match an item labeled `Network` whose value is a string or array containing `4G`; network aliases include `2g`/`GSM`, `3g`/`HSPA`, `4g`/`LTE`, and `5g`/`NR`. `connectivity=gps` or `connectivity=wifi` matches a feature item label (for example GPS, Wi-Fi, or WLAN) in the Network & Connectivity group. `sim=dual-sim` also checks an item labeled `SIM Slot`, including values such as `Dual SIM, GSM+GSM`. `market_status` checks product market status and phone price status. `price_status` filters `data.phone.priceStatus` to `Official` or `Unofficial`. Numeric RAM, storage, battery, camera, and display filters use the extracted `filters` data as well as matching specification values; ensure those fields are populated when products are created or updated. If a product does not contain a display type or refresh-rate value, those filters will not match that product. Unknown optional query parameters are ignored. Invalid numeric values and reversed ranges return `400`. `limit` is capped at 100.

### Latest products

`GET /api/v1/products/latest?page=1&limit=10&brand=apple&price_min=10000&price_max=15000&chipset_type=kirin`

Returns products without an explicit sort by default, or sorted by price when `sort` is provided. Each item includes only `id`, `slug`, `name`, `image`, `marketStatus`, `releaseDate`, `brand`, `price`, `priceStatus`, `score`, `variant`, `variantRegion`, `variantPrice`, `updatedAt`, `imageCount`, and `colorCount`. The response also includes pagination details (`page`, `limit`, `total`, and `pages`). `limit` is capped at 100.

### Official and unofficial phones

`GET /api/v1/products/official-phone?page=1&limit=10&brand=apple&ram=8-gb`  
`GET /api/v1/products/unofficial-phone?page=1&limit=10&brand=apple&ram=8-gb`

These endpoints return the same compact summary and pagination shape as `/products/latest`, filtered by `data.phone.priceStatus` equal to `Official` or `Unofficial`, respectively. Price sorting is available with the same `sort` values, and `limit` is capped at 100.

### Upcoming phones

`GET /api/v1/products/upcoming-phone?page=1&limit=10&brand=apple&display_size=above-7-inches`

Returns the same compact summary and pagination shape as `/products/latest`, filtered by `data.phone.marketStatus` equal to `Upcoming`. Price sorting is available with the same `sort` values, and `limit` is capped at 100.

### Latest comparisons

Create a comparison by sending each phone's display details and product slug. The slug can be used to look up full product information on a comparison details page. The API assigns the comparison's MongoDB ID and timestamps.

```json
{
  "phone1": {
    "name": "Apple iPhone 16 Pro Max",
    "price": "৳249,999",
    "score": "89%",
    "image": "/images/phones/mob.webp",
    "slug": "apple-iphone-16-pro-max"
  },
  "phone2": {
    "name": "Apple iPhone 17 Pro Max",
    "price": "৳199,999",
    "score": "90%",
    "image": "/images/phones/mob.webp",
    "slug": "apple-iphone-17-pro-max"
  }
}
```

Use `POST /api/v1/latest-comparisons` to create a comparison and `GET /api/v1/latest-comparisons?page=1&limit=10` to list them, newest first. The list response includes `data` and pagination details (`page`, `limit`, `total`, and `pages`); `limit` is capped at 100.

### Compare phones

`GET /api/phones/compare?slugs=oneplus-16,iphone-16` compares 2–4 existing products. Use comma-separated product slugs in the order you want them returned. The endpoint also accepts the versioned alias `/api/v1/phones/compare`. It fetches the selected products in one query and returns phone header data plus normalized specification rows. Primary camera and selfie camera specifications are returned in separate groups. Missing specifications are returned as `"Not specified"`. Invalid or duplicate slugs return `400`; unknown product slugs return `404`.

### Create a review

```json
{
  "productSlug": "oneplus-16",
  "name": "Customer",
  "email": "customer@example.com",
  "title": "Great phone",
  "review": "The battery lasts all day.",
  "rating": 5
}
```

Review email addresses are not included in public review responses.
