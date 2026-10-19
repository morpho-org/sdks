import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Address, Chain } from "viem";
import { erc20Abi, maxUint96, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../../test/fixtures/midnight.js";
import {
  APPROVE_ONLY_ONCE_TOKENS,
  MAX_TOKEN_APPROVALS,
} from "../../../helpers/index.js";
import {
  ApprovalAmountLessThanSpendAmountError,
  ChainIdMismatchError,
  InputExceedsMaxError,
  NegativeInputError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";
import { getMidnightApprovalRequirements } from "./getMidnightApprovalRequirements.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");

const answerWrongChain = (handle: ReturnType<typeof createMockClient>) =>
  handle.request.mockImplementation(async ({ method }) => {
    if (method === "eth_chainId")
      return `0x${(midnightChainId + 1).toString(16)}`;
    throw new Error(`unexpected ${method}`);
  });
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
  test("[INV-05] throws ChainIdMismatchError when the client chain differs", async () => {
    const { client } = createMockClient(wrongChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
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
        spender: midnightBundlesV2,
        amount: 0n,
      }),
    ).resolves.toEqual([]);
  });

  test("throws NegativeInputError when amount is negative", async () => {
    const { client } = createMockClient(midnightTestChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
        amount: -1n,
      }),
    ).rejects.toThrow(NegativeInputError);
  });

  test("throws InputExceedsMaxError when amount exceeds uint256", async () => {
    const { client } = createMockClient(midnightTestChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
        amount: maxUint256 + 1n,
      }),
    ).rejects.toThrow(InputExceedsMaxError);
  });

  test("error: UnsupportedErc20ApprovalSpenderError", async () => {
    const { client } = createMockClient(midnightTestChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.taker,
        amount: 1n,
      }),
    ).rejects.toThrow(UnsupportedErc20ApprovalSpenderError);
  });

  test.each([
    { name: "Midnight", spender: midnightAddresses.midnight },
    { name: "MidnightBundlesV2", spender: midnightBundlesV2 },
  ])(
    "returns an approval for $name when allowance is insufficient",
    async ({ spender }) => {
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
        spender,
        amount: 1_000n,
      });

      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action.type).toBe("erc20Approval");
      expect(requirements[0]?.action.args.spender).toBe(spender);
      expect(requirements[0]?.action.args.amount).toBe(maxUint256);
    },
  );

  test("returns an unlimited approval when allowance is non-zero but below amount", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 500n,
    });

    const requirements = await getMidnightApprovalRequirements({
      viemClient: handle.client,
      chainId: midnightChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightBundlesV2,
      amount: 1_000n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.type).toBe("erc20Approval");
    expect(requirements[0]?.action.args.spender).toBe(midnightBundlesV2);
    expect(requirements[0]?.action.args.amount).toBe(maxUint256);
  });

  test("approves approvalAmount instead of maxUint256 when passed", async () => {
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
      spender: midnightBundlesV2,
      amount: 1_000n,
      approvalAmount: 5_000n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.type).toBe("erc20Approval");
    expect(requirements[0]?.action.args.spender).toBe(midnightBundlesV2);
    expect(requirements[0]?.action.args.amount).toBe(5_000n);
  });

  test("throws ApprovalAmountLessThanSpendAmountError when approvalAmount is below amount", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    await expect(
      getMidnightApprovalRequirements({
        viemClient: handle.client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
        amount: 1_000n,
        approvalAmount: 999n,
      }),
    ).rejects.toThrow(ApprovalAmountLessThanSpendAmountError);
  });

  test("throws InputExceedsMaxError when approvalAmount exceeds uint256", async () => {
    const { client } = createMockClient(midnightTestChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
        amount: 1_000n,
        approvalAmount: maxUint256 + 1n,
      }),
    ).rejects.toThrow(InputExceedsMaxError);
  });

  test("throws NegativeInputError when approvalAmount is negative", async () => {
    const { client } = createMockClient(midnightTestChain);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
        amount: 1_000n,
        approvalAmount: -1n,
      }),
    ).rejects.toThrow(NegativeInputError);
  });

  test("caps the unlimited approval at the token's MAX_TOKEN_APPROVALS maximum", async () => {
    const spender = getChainAddress(ChainId.EthMainnet, "midnight");
    const uni = Object.keys(
      MAX_TOKEN_APPROVALS[ChainId.EthMainnet]!,
    )[0] as Address;
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: uni,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const requirements = await getMidnightApprovalRequirements({
      viemClient: handle.client,
      chainId: mainnet.id,
      token: uni,
      owner: midnightAddresses.taker,
      spender,
      amount: 1_000n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.args.amount).toBe(maxUint96);
  });

  test("resets allowance to zero before approving an APPROVE_ONLY_ONCE token", async () => {
    const spender = getChainAddress(ChainId.EthMainnet, "midnight");
    const usdt = APPROVE_ONLY_ONCE_TOKENS[ChainId.EthMainnet]![0]!;
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdt,
      abi: erc20Abi,
      functionName: "allowance",
      result: 500n,
    });

    const requirements = await getMidnightApprovalRequirements({
      viemClient: handle.client,
      chainId: mainnet.id,
      token: usdt,
      owner: midnightAddresses.taker,
      spender,
      amount: 1_000n,
    });

    expect(requirements.map(({ action }) => action.args.amount)).toEqual([
      0n,
      maxUint256,
    ]);
  });

  test("returns no approval when allowance already covers the amount", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 1_000n,
    });

    await expect(
      getMidnightApprovalRequirements({
        viemClient: handle.client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
        amount: 1_000n,
      }),
    ).resolves.toEqual([]);
  });
  test("[INV-05] error: ChainIdMismatchError when the RPC reports another chain via eth_chainId", async () => {
    const handle = createMockClient(midnightTestChain);
    answerWrongChain(handle);
    await expect(
      getMidnightApprovalRequirements({
        viemClient: handle.client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightBundlesV2,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });
});
