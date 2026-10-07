import { ChainId, UnknownAddressError } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import { getBlueBuyCallbackAddress } from "./callback.js";

describe("getBlueBuyCallbackAddress", () => {
  const owner = "0x1111111111111111111111111111111111111111";
  const salt = `0x${"ab".repeat(32)}` as const;

  test.each([
    [ChainId.EthMainnet, "0x8E2D6Dc011a5D0707d4c1f784f1AbE8e2F22CcBB"],
    [ChainId.BaseMainnet, "0xA708d48561220ef7b7e7D22aAfAE691bf3B85FC0"],
    [ChainId.RobinhoodMainnet, "0x99671150E374a96C809c19d96407aFA8332b5A6b"],
    [ChainId.ArcMainnet, "0x9da312d4fC1bA828E028F8ed457AA9586079dAd0"],
  ])(
    "matches the factory's createBlueBuyCallback on chain %i",
    (chainId, expected) => {
      expect(getBlueBuyCallbackAddress({ chainId, owner, salt })).toBe(
        expected,
      );
    },
  );

  test("error: UnknownAddressError when the chain has no callback factory", () => {
    expect(() =>
      getBlueBuyCallbackAddress({
        chainId: ChainId.ArbitrumMainnet,
        owner,
        salt,
      }),
    ).toThrow(UnknownAddressError);
  });
});
