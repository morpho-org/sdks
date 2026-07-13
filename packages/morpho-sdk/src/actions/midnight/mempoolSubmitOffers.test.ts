import type { Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../test/fixtures/midnight.js";
import { mempoolSubmitOffers } from "./mempoolSubmitOffers.js";

const group =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
const otherGroup =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex;
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

  test("behavior: does not freeze the caller-owned groups array", () => {
    const groups = [group];
    const tx = mempoolSubmitOffers({
      chainId: midnightChainId,
      groups,
      root,
      maker: midnightAddresses.maker,
      ratifier: midnightAddresses.ecrecoverRatifier,
      ratifierType: "ecrecover",
      offers: 1,
      payload,
    });

    expect(tx.action.args.groups).not.toBe(groups);
    expect(Object.isFrozen(tx.action.args.groups)).toBe(true);
    expect(Object.isFrozen(groups)).toBe(false);

    groups.push(otherGroup);

    expect(groups).toEqual([group, otherGroup]);
    expect(tx.action.args.groups).toEqual([group]);
  });
});
