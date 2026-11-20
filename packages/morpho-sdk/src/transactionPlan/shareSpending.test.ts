import { Token } from "@morpho-org/blue-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
} from "../../test/fixtures/inKindRedeem.js";
import { ChainIdMismatchError } from "../types/index.js";
import { getVaultShareSpendingRequirements } from "./shareSpending.js";

const types = [
  "vaultV1MigrateToV2",
  "vaultV1Redeem",
  "vaultV2Redeem",
  "vaultV1Withdraw",
  "vaultV2Withdraw",
] as const;
const params = {
  shareToken: new Token({ address: IN_KIND_VAULT, name: "Vault shares" }),
  chainId: mainnet.id,
  account: IN_KIND_USER,
  requiredShareAllowance: 100n,
  deadline: 2_000_000_000n,
  now: 1_900_000_000n,
  supportSignature: true,
};

test.each(types)(
  "%s rejects a declared chain mismatch without RPC",
  async (type) => {
    const handle = createMockClient(mainnet);
    await expect(
      getVaultShareSpendingRequirements(handle.client, {
        ...params,
        chainId: 8453,
        type,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test.each(types)(
  "%s rejects the RPC chain before allowance or nonce reads",
  async (type) => {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (args) =>
      args.method === "eth_chainId" ? "0x2105" : request(args),
    );
    await expect(
      getVaultShareSpendingRequirements(handle.client, { ...params, type }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(
      handle.request.mock.calls.some(([call]) => call.method === "eth_call"),
    ).toBe(false);
  },
);

test.for(types)(
  "%s resolves requirements while code validation is pending",
  async (type, { expect: testExpect }) => {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode") await gate;
      return request(args);
    });
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const pending = getVaultShareSpendingRequirements(handle.client, {
      ...params,
      type,
    });
    try {
      await testExpect
        .poll(() =>
          handle.request.mock.calls.some(
            ([call]) => call.method === "eth_call",
          ),
        )
        .toBe(true);
    } finally {
      release();
      const result = await pending;
      expect(result.approvals).toEqual([]);
      expect(result.signatureRequests).toEqual([]);
    }
  },
);
