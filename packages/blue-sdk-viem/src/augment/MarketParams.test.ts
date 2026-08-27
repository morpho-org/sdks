import { ChainId, InvalidMarketParamsError } from "@morpho-org/blue-sdk";
import { markets } from "@morpho-org/morpho-test";
import { encodeAbiParameters } from "viem";
import { describe, expect, test } from "vitest";
import { MarketParams } from "./MarketParams.js";

const { usdc_wstEth } = markets[ChainId.EthMainnet];

describe("augment/MarketParams", () => {
  test("fromHex decodes market params", () => {
    const data = encodeAbiParameters(
      [
        { type: "address", name: "loanToken" },
        { type: "address", name: "collateralToken" },
        { type: "address", name: "oracle" },
        { type: "address", name: "irm" },
        { type: "uint256", name: "lltv" },
      ],
      [
        usdc_wstEth.loanToken,
        usdc_wstEth.collateralToken,
        usdc_wstEth.oracle,
        usdc_wstEth.irm,
        usdc_wstEth.lltv,
      ],
    );

    expect(MarketParams.fromHex(data)).toStrictEqual(usdc_wstEth);
  });

  test("fromHex throws InvalidMarketParamsError for invalid data", () => {
    const data = encodeAbiParameters(
      [
        { type: "address", name: "loanToken" },
        { type: "address", name: "collateralToken" },
        { type: "address", name: "oracle" },
        { type: "uint256", name: "lltv" },
      ],
      [
        usdc_wstEth.loanToken,
        usdc_wstEth.collateralToken,
        usdc_wstEth.oracle,
        usdc_wstEth.lltv,
      ],
    );

    expect(() => MarketParams.fromHex(data)).toThrow(InvalidMarketParamsError);
  });
});
