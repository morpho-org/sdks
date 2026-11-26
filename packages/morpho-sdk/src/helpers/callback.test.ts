import { type InputMarketParams, marketParamsAbi } from "@morpho-org/blue-sdk";
import { ChainId, UnknownAddressError } from "@morpho-org/morpho-ts";
import { decodeAbiParameters, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
} from "./callback.js";

describe("getMidnightBlueBuyCallbackAddress", () => {
  const owner = "0x1111111111111111111111111111111111111111";
  const salt = `0x${"ab".repeat(32)}` as const;

  test.each([
    [ChainId.EthMainnet, "0x8E2D6Dc011a5D0707d4c1f784f1AbE8e2F22CcBB"],
    [ChainId.BaseMainnet, "0xA708d48561220ef7b7e7D22aAfAE691bf3B85FC0"],
    [ChainId.RobinhoodMainnet, "0x99671150E374a96C809c19d96407aFA8332b5A6b"],
    [ChainId.ArcMainnet, "0x9da312d4fC1bA828E028F8ed457AA9586079dAd0"],
    [ChainId.OptimismMainnet, "0x06d72550466898078962de71425Bf37C32Dd20fc"],
    [ChainId.PolygonMainnet, "0x072e29040dC2185FF6783487a81777A3a0341b0D"],
    [ChainId.WorldChainMainnet, "0x8aE4FB714D3a90d0642E78AB749117eC3dE4D3c4"],
    [ChainId.Unichain, "0x3f5Ce75AAF895D3cCC56D3A6F5c70c655d7b5f42"],
    [ChainId.KatanaMainnet, "0xAC6C07525355705231944A0bB99a36E5666c2a22"],
    [ChainId.MonadMainnet, "0xe805df25F67EF7592aA7a972B418Fc6660aE78F6"],
    [ChainId.StableMainnet, "0x8E73911e66f7ED89A2490619050D7638Bc15C057"],
    [ChainId.AlpenMainnet, "0x7A6C0CC163505B8db00AFaA0ec5b1eA401F14A16"],
  ])(
    "matches the factory's createBlueBuyCallback on chain %i",
    (chainId, expected) => {
      expect(getMidnightBlueBuyCallbackAddress({ chainId, owner, salt })).toBe(
        expected,
      );
    },
  );

  test("error: UnknownAddressError when the chain has no callback factory", () => {
    expect(() =>
      getMidnightBlueBuyCallbackAddress({
        chainId: ChainId.XLayerMainnet,
        owner,
        salt,
      }),
    ).toThrow(UnknownAddressError);
  });
});

describe("getMidnightBlueBuyCallbackData", () => {
  test("encodes the Blue market params", () => {
    const market: InputMarketParams = {
      loanToken: zeroAddress,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    };

    expect(
      decodeAbiParameters(
        [marketParamsAbi],
        getMidnightBlueBuyCallbackData(market),
      )[0],
    ).toEqual(market);
  });
});
