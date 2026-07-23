import assert from "node:assert/strict";
import test from "node:test";
import { europeDeliveryCountries, isEuropeDeliveryCountry } from "./europeShipping.ts";

test("accepts configured European delivery countries", () => {
  assert.equal(isEuropeDeliveryCountry("ES"), true);
  assert.equal(isEuropeDeliveryCountry("FR"), true);
  assert.equal(isEuropeDeliveryCountry("GB"), true);
  assert.equal(isEuropeDeliveryCountry("CH"), true);
});

test("rejects countries outside the European delivery list", () => {
  assert.equal(isEuropeDeliveryCountry("US"), false);
  assert.equal(isEuropeDeliveryCountry("CN"), false);
  assert.equal(isEuropeDeliveryCountry(""), false);
});

test("does not contain duplicate delivery country codes", () => {
  const codes = europeDeliveryCountries.map((country) => country.code);
  assert.equal(new Set(codes).size, codes.length);
});
