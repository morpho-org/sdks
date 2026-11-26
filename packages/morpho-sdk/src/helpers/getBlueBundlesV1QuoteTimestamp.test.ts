import { Time } from "@morpho-org/morpho-ts";
import { maxUint256 } from "viem";
import { expect, test } from "vitest";
import { getBlueBundlesV1QuoteTimestamp } from "./getBlueBundlesV1QuoteTimestamp.js";

const now = 1_800_000_000n;

test.each([0n, 3600n])(
  "health horizon floors and sentinel boundaries with snapshot offset %s",
  (offset) => {
    const lastUpdate = now + offset;
    const boundary = lastUpdate + Time.s.from.d(365n);
    for (const deadline of [
      undefined,
      maxUint256,
      (1n << 48n) - 1n,
      boundary + 1n,
    ]) {
      expect(
        getBlueBundlesV1QuoteTimestamp({ now, lastUpdate, deadline }),
      ).toBe(lastUpdate + 7200n);
    }
    for (const deadline of [
      now - 1n,
      now,
      now + 1800n,
      now + 86_400n,
      boundary,
    ]) {
      expect(
        getBlueBundlesV1QuoteTimestamp({ now, lastUpdate, deadline }),
      ).toBe(deadline < lastUpdate ? lastUpdate : deadline);
    }
  },
);

test("health horizon floors an older snapshot at now", () => {
  expect(
    getBlueBundlesV1QuoteTimestamp({
      now,
      lastUpdate: now - 3600n,
      deadline: now - 1n,
    }),
  ).toBe(now);
});
