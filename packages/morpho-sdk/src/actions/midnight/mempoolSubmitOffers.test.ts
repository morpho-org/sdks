import type { Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../test/fixtures/midnight.js";
import { mempoolSubmitOffers } from "./mempoolSubmitOffers.js";

const group =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
const root =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex;
const payload = "0x12345678" as Hex;

describe("mempoolSubmitOffers", () => {
  test("default", () => {
    const tx = mempoolSubmitOffers({
      chainId: midnightChainId,
      groups: [group],
      root,
      maker: midnightAddresses.maker,
      ratifier: midnightAddresses.ecrecoverRatifier,
      ratifierType: "ecrecover",
      offers: 1,
      payload,
    });

    expect(tx.to).toBe(midnightAddresses.midnightMempool);
    expect(tx.data).toBe(payload);
    expect(tx.action.args).toEqual({
      groups: [group],
      root,
      maker: midnightAddresses.maker,
      ratifier: midnightAddresses.ecrecoverRatifier,
      ratifierType: "ecrecover",
      offers: 1,
    });
  });

  test("behavior: appends metadata", () => {
    const tx = mempoolSubmitOffers({
      chainId: midnightChainId,
      groups: [group],
      root,
      maker: midnightAddresses.maker,
      ratifier: midnightAddresses.ecrecoverRatifier,
      ratifierType: "ecrecover",
      offers: 1,
      payload,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.type).toBe("mempoolSubmitOffers");
    expect(tx.data).toBe(`${payload}a1b2c3d4`);
  });
});
