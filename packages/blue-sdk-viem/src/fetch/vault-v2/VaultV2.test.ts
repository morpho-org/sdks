import { getChainAddresses, UnknownTokenError } from "@morpho-org/blue-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  BaseError,
  ContractFunctionRevertedError,
  erc20Abi,
  HttpRequestError,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import { mockReadFailure } from "../../__test__/viem.js";
import { erc5267Abi, vaultV2Abi, vaultV2FactoryAbi } from "../../abis.js";
import { isTransportError } from "../../utils.js";
import { fetchVaultV2 } from "./VaultV2.js";

for (const status of [429, 503]) {
  test(`fetchVaultV2 propagates metadata HTTP ${status} before pending state reverts`, async () => {
    const handle = createMockClient(mainnet);
    const address = "0x2222222222222222222222222222222222222222";
    const transportError = new HttpRequestError({
      url: "https://rpc.test",
      status,
    });
    const stateError = new ContractFunctionRevertedError({
      abi: vaultV2Abi,
      functionName: "asset",
    });
    const state = Promise.withResolvers<void>();
    const metadata = Promise.withResolvers<void>();
    const base = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_call") {
        const [tx] = (call.params ?? []) as [{ data?: string }];
        if (tx.data?.startsWith("0x313ce567")) {
          metadata.resolve();
          throw transportError;
        }
        await state.promise;
        throw stateError;
      }
      return base(call);
    });
    let settled = false;
    const result = fetchVaultV2(address, handle.client, {
      deployless: false,
    }).then(
      (value) => {
        settled = true;
        return value;
      },
      (reason: unknown) => {
        settled = true;
        return reason;
      },
    );
    let settledBeforeState: boolean;
    try {
      await metadata.promise;
      await new Promise((resolve) => setImmediate(resolve));
      settledBeforeState = settled;
    } finally {
      state.resolve();
    }
    const error = await result;
    expect(settledBeforeState).toBe(true);
    expect(error).toBeInstanceOf(BaseError);
    expect(isTransportError(error)).toBe(true);
    if (!(error instanceof BaseError)) expect.fail("Expected a viem error");
    expect(error.walk((cause) => cause === transportError)).toBe(
      transportError,
    );
  });
}

test("fetchVaultV2 preserves metadata errors when required state succeeds", async () => {
  const handle = createMockClient(mainnet);
  const address = "0x2222222222222222222222222222222222222222";
  mockRead(handle, {
    address: getChainAddresses(mainnet.id).vaultV2Factory!,
    abi: vaultV2FactoryAbi,
    functionName: "isVaultV2",
    result: true,
  });
  for (const functionName of [
    "totalSupply",
    "_totalAssets",
    "performanceFee",
    "managementFee",
    "virtualShares",
    "lastUpdate",
    "maxRate",
    "adaptersLength",
  ] as const) {
    mockRead(handle, { address, abi: vaultV2Abi, functionName, result: 0n });
  }
  for (const functionName of [
    "asset",
    "liquidityAdapter",
    "performanceFeeRecipient",
    "managementFeeRecipient",
  ] as const) {
    mockRead(handle, {
      address,
      abi: vaultV2Abi,
      functionName,
      result: zeroAddress,
    });
  }
  mockRead(handle, {
    address,
    abi: vaultV2Abi,
    functionName: "liquidityData",
    result: "0x",
  });
  mockRead(handle, {
    address,
    abi: vaultV2Abi,
    functionName: "balanceOf",
    result: 0n,
  });
  for (const functionName of ["name", "symbol"] as const) {
    mockRead(handle, { address, abi: erc20Abi, functionName, result: "Vault" });
  }
  mockReadFailure(handle, { address, abi: erc20Abi, functionName: "decimals" });
  mockReadFailure(handle, {
    address,
    abi: erc5267Abi,
    functionName: "eip712Domain",
  });

  await expect(
    fetchVaultV2(address, handle.client, { deployless: false }),
  ).rejects.toBeInstanceOf(UnknownTokenError);
});
