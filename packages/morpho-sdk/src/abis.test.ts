import { toFunctionSelector, toFunctionSignature } from "viem";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "./abis.js";

describe("blueBundlesV1Abi", () => {
  test("matches the selectors deployed at registered BlueBundlesV1 addresses", () => {
    const selectors = Object.fromEntries(
      blueBundlesV1Abi
        .filter((item) => item.type === "function")
        .map((item) => [
          item.name,
          toFunctionSelector(toFunctionSignature(item)),
        ]),
    );

    expect(selectors).toMatchObject({
      blueBundlesV1Supply: "0xa4d5ece4",
      blueBundlesV1SupplyCollateralAndBorrow: "0xb1268765",
      blueBundlesV1RepayAndWithdrawCollateral: "0x827d6bd8",
      blueBundlesV1Withdraw: "0xc0229fe8",
      blueBundlesV1MigrateBorrowPosition: "0x9834e387",
    });
  });
});
