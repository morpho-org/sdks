import { ChainId } from "@morpho-org/blue-sdk";
import nock from "nock";

import { markets } from "@morpho-org/morpho-test";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";
import getSharedLiquidity from "../src/shared-liquidity.js";
import sharedLiquidityMock0 from "./mocks/shared-liquidity.0.json";
import { test } from "./setup.js";

const { usdc_wstEth } = markets[ChainId.EthMainnet];

describe("shared-liquidity", () => {
  test("should fetch shared liquidity", async ({ client }) => {
    nock(BLUE_API_BASE_URL).post("/graphql").reply(200, sharedLiquidityMock0);

    const reallocations = await getSharedLiquidity(usdc_wstEth.id, client, {
      chainId: ChainId.EthMainnet,
    });

    expect(reallocations).toStrictEqual([
      {
        assets: 2182984472273n,
        id: "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
      {
        assets: 1394227258663n,
        id: "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
      {
        assets: 89n,
        id: "0x3bb29b62affbedc60b8446b235aaa349d5e3bad96c09bca1d7a2d693c06669aa",
        vault: "0x186514400e52270cef3D80e1c6F8d10A75d47344",
      },
    ]);
  });
});
