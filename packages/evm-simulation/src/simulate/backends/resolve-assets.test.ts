import { MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { BaseError, erc4626Abi, HttpRequestError, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ExternalServiceError,
  MissingVerificationEvidenceError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import { resolveAssets } from "./resolve-assets.js";

const vault = "0x0000000000000000000000000000000000000001";
const loan = "0x0000000000000000000000000000000000000002";
const collateral = "0x0000000000000000000000000000000000000003";
const marketId = new MarketParams({
  loanToken: loan,
  collateralToken: collateral,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
}).id;
const limit: OperationLimit = {
  type: "vaultV2Deposit",
  vault,
  quote: { assetsPaid: 10n },
  slippageTolerance: 0n,
};

describe("resolveAssets", () => {
  test("default: no limits cause no RPC reads", async () => {
    const handle = createMockClient(mainnet);
    expect(
      await resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        operations: [],
        blockNumber: 1n,
      }),
    ).toEqual([]);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("behavior: share-only and explicit-asset quotes cause no RPC reads", async () => {
    const handle = createMockClient(mainnet);
    const operations: OperationLimit[] = [
      { ...limit, quote: { sharesMinted: 1n } },
      { ...limit, assetPaid: loan },
    ];
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations,
      blockNumber: 1n,
    });
    expect(result[0]).toEqual({ limit: operations[0] });
    expect(result[1]?.assetsPaid).toBe(loan);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("behavior: vault asset is pinned and deduplicated without factory or entity reads", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: vault,
      abi: erc4626Abi,
      functionName: "asset",
      result: loan,
    });
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [limit, limit],
      blockNumber: 10n,
    });
    expect(result.map((r) => r.assetsPaid)).toEqual([loan, loan]);
    expect(handle.request).toHaveBeenCalledTimes(1);
    expect(handle.request.mock.calls[0]?.[0].params?.[1]).toBe("0xa");
  });
  test("behavior: combined actions choose collateral and loan tokens by direction", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [loan, collateral, zeroAddress, zeroAddress, 0n],
    });
    const operations: OperationLimit[] = [
      "blueSupplyCollateralBorrow",
      "blueRepayWithdrawCollateral",
    ].map((type) => ({
      type: type as
        | "blueSupplyCollateralBorrow"
        | "blueRepayWithdrawCollateral",
      marketId,
      quote: { assetsPaid: 1n, assetsReceived: 1n },
      slippageTolerance: 0n,
    }));
    const result = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations,
      blockNumber: 1n,
    });
    expect(
      result.map(({ assetsPaid, assetsReceived }) => [
        assetsPaid,
        assetsReceived,
      ]),
    ).toEqual([
      [collateral, loan],
      [loan, collateral],
    ]);
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test("error: non-transport metadata failure becomes missing evidence", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(new BaseError("execution reverted"));
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(MissingVerificationEvidenceError);
  });
  test("error: HttpRequestError remains bypassable", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new HttpRequestError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveAssets({
        client: handle.client,
        morpho: zeroAddress,
        operations: [limit],
        blockNumber: 1n,
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
  test("error: zero market token metadata becomes missing evidence", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: zeroAddress,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [zeroAddress, collateral, zeroAddress, zeroAddress, 0n],
    });
    const error = await resolveAssets({
      client: handle.client,
      morpho: zeroAddress,
      operations: [
        {
          type: "blueBorrow",
          marketId,
          quote: { assetsReceived: 1n },
          slippageTolerance: 0n,
        },
      ],
      blockNumber: 1n,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MissingVerificationEvidenceError);
    expect((error as Error).message).toContain(
      `market:${marketId.toLowerCase()}`,
    );
  });
});
