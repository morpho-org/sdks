import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Chain } from "viem";
import { erc20Abi } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../../test/fixtures/midnight.js";
import { ChainIdMismatchError } from "../../../types/index.js";
import { getMidnightApprovalRequirements } from "./getMidnightApprovalRequirements.js";

const midnightTestChain = {
  id: midnightChainId,
  name: "Midnight Test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
} as const satisfies Chain;

const wrongChain = {
  ...midnightTestChain,
  id: midnightChainId + 1,
} as const satisfies Chain;

describe("getMidnightApprovalRequirements", () => {
  test("throws ChainIdMismatchError when the client chain differs", async () => {
    const { client } = createMockClient(wrongChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1n,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("returns no approval when amount is zero", async () => {
    const { client } = createMockClient(midnightTestChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 0n,
      }),
    ).resolves.toEqual([]);
  });

  test("returns an approval when allowance is insufficient", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const requirements = await getMidnightApprovalRequirements({
      viemClient: handle.client,
      chainId: midnightChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.type).toBe("erc20Approval");
    expect(requirements[0]?.action.args.spender).toBe(
      midnightAddresses.midnightBundles,
    );
    expect(requirements[0]?.action.args.amount).toBe(1_000n);
  });
});
