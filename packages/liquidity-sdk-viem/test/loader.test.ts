import { ChainId } from "@morpho-org/blue-sdk";
import nock from "nock";

import { markets } from "@morpho-org/morpho-test";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";
import { LiquidityLoader } from "../src";
import apiMock0 from "./mocks/dataloader.0.json";
import apiMock1 from "./mocks/dataloader.1.json";
import { test } from "./setup.js";

const { usdc_wstEth, eth_wstEth, usdc_wbtc } = markets[ChainId.EthMainnet];

describe("dataloader", () => {
  test("should fetch shared liquidity from api", async ({ client }) => {
    nock(BLUE_API_BASE_URL).post("/graphql").reply(200, apiMock0);

    const reallocations = await new LiquidityLoader(client).fetch(
      usdc_wstEth.id,
    );

    expect(reallocations).toStrictEqual([
      {
        assets: 3484378624251n,
        id: "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
      {
        assets: 1511008658317n,
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

  test("should fetch shared liquidity for 1 market from api and 1 from rpc", async ({
    client,
  }) => {
    nock(BLUE_API_BASE_URL).post("/graphql").reply(200, apiMock1);

    const loader = new LiquidityLoader(client);

    const [eth_reallocations, usdc_reallocations] = await Promise.all([
      loader.fetch(eth_wstEth.id, "api"),
      loader.fetch(usdc_wbtc.id, "rpc"),
    ]);

    expect(eth_reallocations).toStrictEqual([
      {
        assets: 1275130606448103386958n,
        id: "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e",
        vault: "0x2371e134e3455e0593363cBF89d3b6cf53740618",
      },
      {
        assets: 389065680030846265972n,
        id: "0xd0e50cdac92fe2172043f5e0c36532c6369d24947e40968f34a5e8819ca9ec5d",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 365462549282824742961n,
        id: "0xba761af4134efb0855adfba638945f454f0a704af11fc93439e20c7c5ebab942",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 213832870661212422340n,
        id: "0x2287407f0f42ad5ad224f70e4d9da37f02770f79959df703d6cfee8afc548e0d",
        vault: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
      },
      {
        assets: 124910324631670795145n,
        id: "0xcacd4c39af872ddecd48b650557ff5bcc7d3338194c0f5b2038e0d4dec5dc022",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 34063242931816427292n,
        id: "0x138eec0e4a1937eb92ebc70043ed539661dd7ed5a89fb92a720b341650288a40",
        vault: "0x2371e134e3455e0593363cBF89d3b6cf53740618",
      },
      {
        assets: 23606063480643419318n,
        id: "0x37e7484d642d90f14451f1910ba4b7b8e4c3ccdd0ec28f8b2bdb35479e472ba7",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 12850528338832344500n,
        id: "0xa0534c78620867b7c8706e3b6df9e69a2bc67c783281b7a77e034ed75cee012e",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 240388038072619n,
        id: "0x87a3e5dbcd822f2a543bea1365b7dd99ad9a1cb460061278319732e63207c792",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
    ]);
    expect(usdc_reallocations).toStrictEqual([
      {
        assets: 2520865757934n,
        id: "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
      {
        assets: 1511043966036n,
        id: "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
    ]);
  });

  test("should fetch shared liquidity for 2 markets from rpc", async ({
    client,
  }) => {
    nock(BLUE_API_BASE_URL).post("/graphql").reply(200, apiMock1);

    const loader = new LiquidityLoader(client);

    const [eth_reallocations, usdc_reallocations] = await Promise.all([
      loader.fetch(eth_wstEth.id, "rpc"),
      loader.fetch(usdc_wbtc.id, "rpc"),
    ]);

    expect(eth_reallocations).toStrictEqual([
      {
        assets: 1275144276734080632552n,
        id: "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e",
        vault: "0x2371e134e3455e0593363cBF89d3b6cf53740618",
      },
      {
        assets: 365465048514113074088n,
        id: "0xba761af4134efb0855adfba638945f454f0a704af11fc93439e20c7c5ebab942",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 228471622085361256302n,
        id: "0xd0e50cdac92fe2172043f5e0c36532c6369d24947e40968f34a5e8819ca9ec5d",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 213832870661212422340n,
        id: "0x2287407f0f42ad5ad224f70e4d9da37f02770f79959df703d6cfee8afc548e0d",
        vault: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
      },
      {
        assets: 124911296698782030621n,
        id: "0xcacd4c39af872ddecd48b650557ff5bcc7d3338194c0f5b2038e0d4dec5dc022",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 34069503072379984617n,
        id: "0x138eec0e4a1937eb92ebc70043ed539661dd7ed5a89fb92a720b341650288a40",
        vault: "0x2371e134e3455e0593363cBF89d3b6cf53740618",
      },
      {
        assets: 23608215641354353589n,
        id: "0x37e7484d642d90f14451f1910ba4b7b8e4c3ccdd0ec28f8b2bdb35479e472ba7",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 12852846099174832007n,
        id: "0xa0534c78620867b7c8706e3b6df9e69a2bc67c783281b7a77e034ed75cee012e",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
      {
        assets: 240388315328607n,
        id: "0x87a3e5dbcd822f2a543bea1365b7dd99ad9a1cb460061278319732e63207c792",
        vault: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658",
      },
    ]);
    expect(usdc_reallocations).toStrictEqual([
      {
        assets: 2520865757934n,
        id: "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
      {
        assets: 1511043966036n,
        id: "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
      },
    ]);
  });
});
