import { MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  ContractFunctionRevertedError,
  HttpRequestError,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ExternalServiceError,
  MissingVerificationEvidenceError,
} from "../../errors.js";
import { resolveHealthMarkets } from "./resolve-health-markets.js";

const other: Address = "0x0000000000000000000000000000000000000002";
const morpho: Address = "0x0000000000000000000000000000000000000003";
const params = {
  loanToken: "0x0000000000000000000000000000000000000004",
  collateralToken: "0x0000000000000000000000000000000000000005",
  oracle: "0x0000000000000000000000000000000000000006",
  irm: "0x0000000000000000000000000000000000000007",
  lltv: 80_0000000000000000n,
} as const;
const marketId = new MarketParams(params).id;
const context = { chainId: 1, mode: "final", blockNumber: 1n } as const;

describe("resolveHealthMarkets", () => {
  test("default: no positions cause no RPC reads", async () => {
    const handle = createMockClient(mainnet);
    expect(
      await resolveHealthMarkets({
        client: handle.client,
        morpho,
        positions: [],
        context,
      }),
    ).toEqual([]);
    expect(handle.request).not.toHaveBeenCalled();
  });
  test("behavior: market params are read once per market", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [
        params.loanToken,
        params.collateralToken,
        params.oracle,
        params.irm,
        params.lltv,
      ],
    });
    expect(
      await resolveHealthMarkets({
        client: handle.client,
        morpho,
        positions: [{ marketId }, { marketId, account: other }],
        context,
      }),
    ).toEqual([{ marketId, params }]);
    expect(handle.request).toHaveBeenCalledTimes(1);
  });
  test("error: a reverted params read is missing evidence", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new ContractFunctionRevertedError({
        abi: blueAbi,
        functionName: "idToMarketParams",
      }),
    );
    await expect(
      resolveHealthMarkets({
        client: handle.client,
        morpho,
        positions: [{ marketId }],
        context,
      }),
    ).rejects.toBeInstanceOf(MissingVerificationEvidenceError);
  });
  test("error: a transport failure is an ExternalServiceError", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockRejectedValue(
      new HttpRequestError({ body: {}, url: "https://rpc.example" }),
    );
    await expect(
      resolveHealthMarkets({
        client: handle.client,
        morpho,
        positions: [{ marketId }],
        context,
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
  test("error: an uncreated market is missing evidence", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: [zeroAddress, zeroAddress, zeroAddress, zeroAddress, 0n],
    });
    await expect(
      resolveHealthMarkets({
        client: handle.client,
        morpho,
        positions: [{ marketId }],
        context,
      }),
    ).rejects.toThrow(MissingVerificationEvidenceError);
  });
});
