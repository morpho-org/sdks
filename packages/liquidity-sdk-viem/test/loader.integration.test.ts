import { ChainId } from "@morpho-org/blue-sdk";
import { markets } from "@morpho-org/morpho-test";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import nock from "nock";
import { describe, expect } from "vitest";
import { LiquidityLoader } from "../src/index.js";
import apiMock0 from "./mocks/dataloader.0.json" with { type: "json" };
import apiMock1 from "./mocks/dataloader.1.json" with { type: "json" };
import { test } from "./setup.js";

const { usdc_wstEth, eth_wstEth, usdc_wbtc } = markets[ChainId.EthMainnet];

describe("dataloader", () => {
  test("should fetch shared liquidity", async ({ client }) => {
    nock(BLUE_API_BASE_URL).post("/graphql").reply(200, apiMock0);

    const { withdrawals: reallocations } = await new LiquidityLoader(
      client,
    ).fetch(usdc_wstEth.id);

    expect(reallocations).toStrictEqual([
      {
        assets: 1609457675962n,
        id: "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
    ]);
  });

  test("should fetch shared liquidity for 2 markets", async ({ client }) => {
    nock(BLUE_API_BASE_URL).post("/graphql").reply(200, apiMock1);

    const loader = new LiquidityLoader(client);

    const [
      { withdrawals: eth_reallocations },
      { withdrawals: usdc_reallocations },
    ] = await Promise.all([
      loader.fetch(eth_wstEth.id),
      loader.fetch(usdc_wbtc.id),
    ]);

    expect(eth_reallocations).toStrictEqual([
      {
        assets: 1159397680152036107732n,
        id: "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e",
        vault: "0x2371e134e3455e0593363cBF89d3b6cf53740618",
      },
      {
        assets: 334181181282594142674n,
        id: "0xba761af4134efb0855adfba638945f454f0a704af11fc93439e20c7c5ebab942",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 213832870661212422340n,
        id: "0x2287407f0f42ad5ad224f70e4d9da37f02770f79959df703d6cfee8afc548e0d",
        vault: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
      },
      {
        assets: 119531849162836164920n,
        id: "0xcacd4c39af872ddecd48b650557ff5bcc7d3338194c0f5b2038e0d4dec5dc022",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 84374938643006667977n,
        id: "0xd0e50cdac92fe2172043f5e0c36532c6369d24947e40968f34a5e8819ca9ec5d",
        vault: "0x2371e134e3455e0593363cBF89d3b6cf53740618",
      },
      {
        assets: 66930590311663470057n,
        id: "0x0eed5a89c7d397d02fd0b9b8e42811ca67e50ed5aeaa4f22e506516c716cfbbf",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 23306805022282394159n,
        id: "0x698fe98247a40c5771537b5786b2f3f9d78eb487b4ce4d75533cd0e94d88a115",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 14167222149320089956n,
        id: "0x138eec0e4a1937eb92ebc70043ed539661dd7ed5a89fb92a720b341650288a40",
        vault: "0x2371e134e3455e0593363cBF89d3b6cf53740618",
      },
      {
        assets: 10242440491887459673n,
        id: "0xa0534c78620867b7c8706e3b6df9e69a2bc67c783281b7a77e034ed75cee012e",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 348595829549040913n,
        id: "0xea023e57814fb9a814a5a9ee9f3e7ece5b771dd8cc703e50b911e9cde064a12d",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
    ]);
    // At the pinned block, every usdc_wbtc source market already sits at or
    // above 90% utilization, so the default 90% withdrawal ceiling (previously
    // the API's per-market targetWithdrawUtilization) yields no withdrawals.
    expect(usdc_reallocations).toStrictEqual([]);
  });
});
