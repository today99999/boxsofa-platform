import assert from "node:assert/strict";
import test from "node:test";

import { products } from "./catalog.ts";
import { buildGoogleMerchantFeed } from "./google-merchant-feed.ts";

test("builds an English Google Merchant TSV feed for every product", () => {
  const feed = buildGoogleMerchantFeed(products, "https://boxsofa.eu");
  const [header, ...rows] = feed.trimEnd().split("\n");
  const columns = header.split("\t");

  assert.equal(rows.length, products.length);
  assert.deepEqual(columns.slice(0, 8), [
    "id",
    "title",
    "description",
    "link",
    "image_link",
    "availability",
    "price",
    "condition"
  ]);

  const first = Object.fromEntries(columns.map((column, index) => [column, rows[0].split("\t")[index]]));
  assert.equal(first.id, products[0].sku);
  assert.match(first.title, /Sofa/);
  assert.doesNotMatch(first.title, /[\u4e00-\u9fff]/);
  assert.equal(first.link, `https://boxsofa.eu/product/${products[0].slug}`);
  assert.equal(first.image_link, `https://boxsofa.eu${products[0].mainImage}`);
  assert.equal(first.availability, "in_stock");
  assert.equal(first.price, `${products[0].priceEur.toFixed(2)} EUR`);
  assert.equal(first.condition, "new");
  assert.equal(first.identifier_exists, "no");

  for (const row of rows) {
    const values = Object.fromEntries(columns.map((column, index) => [column, row.split("\t")[index]]));
    assert.doesNotMatch(`${values.title} ${values.color}`, /[\u4e00-\u9fff]/);
  }
});

test("sanitizes tabs and line breaks so rows remain valid", () => {
  const feed = buildGoogleMerchantFeed(
    [{ ...products[0], name: "Test\tSofa", description: "Line one\nLine two" }],
    "https://boxsofa.eu/"
  );
  const lines = feed.trimEnd().split("\n");

  assert.equal(lines.length, 2);
  assert.equal(lines[0].split("\t").length, lines[1].split("\t").length);
  assert.doesNotMatch(lines[1], /\r/);
});
