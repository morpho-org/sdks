import { MathLib } from "@morpho-org/blue-sdk";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import type { Chain } from "viem";
import {
  type Address,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  isAddressEqual,
} from "viem";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  CryptoUnavailableError,
  isRequirementApproval,
  isRequirementSignature,
} from "../../../types/index.js";
import { getMidnightBundlesRequirements } from "./getMidnightBundlesRequirements.js";

vi.mock("@morpho-org/blue-sdk-viem", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@morpho-org/blue-sdk-viem")>();

  return {
    ...actual,
    fetchToken: vi.fn(),
  };
});

import { erc2612Abi, fetchToken } from "@morpho-org/blue-sdk-viem";

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

const noPermit2ChainId = midnightChainId + 2;
const noPermit2Chain = {
  ...midnightTestChain,
  id: noPermit2ChainId,
  name: "Midnight Test Without Permit2",
} as const satisfies Chain;

registerCustomAddresses({
  addresses: {
    [noPermit2ChainId]: {
      morpho: midnightAddresses.morpho,
      bundler3: {
        bundler3: midnightAddresses.bundler3,
        generalAdapter1: midnightAddresses.generalAdapter1,
      },
      adaptiveCurveIrm: midnightAddresses.adaptiveCurveIrm,
      midnight: midnightAddresses.midnight,
      midnightBundles: midnightAddresses.midnightBundles,
      midnightMempool: midnightAddresses.midnightMempool,
      ecrecoverRatifier: midnightAddresses.ecrecoverRatifier,
      setterRatifier: midnightAddresses.setterRatifier,
    },
  },
});

const mockAllowanceReads = (params: {
  readonly handle: ReturnType<typeof createMockClient>;
  readonly chainId?: number;
  readonly token?: Address;
  readonly directAllowance: bigint;
  readonly permit2Allowance: bigint;
  readonly nonce?: bigint;
}) => {
  const token = params.token ?? midnightAddresses.loanToken;
  let nonceReads = 0;

  params.handle.request.mockImplementation(async ({ method, params: rpc }) => {
    if (method === "eth_chainId") {
      return `0x${(params.chainId ?? midnightChainId).toString(16)}`;
    }
    if (method === "eth_call") {
      const [tx] = (rpc ?? []) as [{ to?: Address; data?: Hex }];
      if (tx?.to != null && isAddressEqual(tx.to, token) && tx.data != null) {
        try {
          const decodedNonce = decodeFunctionData({
            abi: erc2612Abi,
            data: tx.data,
          });
          if (decodedNonce.functionName === "nonces" && params.nonce != null) {
            nonceReads += 1;

            return encodeFunctionResult({
              abi: erc2612Abi,
              functionName: "nonces",
              result: params.nonce,
            });
          }
        } catch {}

        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: tx.data,
        });
        if (decoded.functionName === "allowance") {
          const spender = decoded.args[1];
          const result = isAddressEqual(
            spender,
            midnightAddresses.midnightBundles,
          )
            ? params.directAllowance
            : params.permit2Allowance;

          return encodeFunctionResult({
            abi: erc20Abi,
            functionName: "allowance",
            result,
          });
        }
      }
    }

    throw new Error(`unhandled RPC ${method}`);
  });

  return {
    get nonceReads() {
      return nonceReads;
    },
  };
};

describe.sequential("getMidnightBundlesRequirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchToken).mockResolvedValue({
      address: midnightAddresses.loanToken,
      decimals: 6,
      symbol: "MOCK",
      name: "Mock Token",
      fromUsd: () => 0n,
      toUsd: () => 0n,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("error: ChainIdMismatchError", async () => {
    const { client } = createMockClient(wrongChain);

    await expect(
      getMidnightBundlesRequirements({
        viemClient: client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1n,
        supportSignature: false,
      }),
    ).rejects.toThrow(ChainIdMismatchError);
  });

  test("default", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 2_000n,
    });

    const requirements = await getMidnightBundlesRequirements({
      viemClient: handle.client,
      chainId: midnightChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      supportSignature: false,
    });

    expect(requirements).toEqual([]);
  });

  test("behavior: returns no requirements when amount is zero", async () => {
    const handle = createMockClient(midnightTestChain);

    const requirements = await getMidnightBundlesRequirements({
      viemClient: handle.client,
      chainId: midnightChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 0n,
      supportSignature: true,
    });

    expect(requirements).toEqual([]);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("behavior: returns classic approval when signatures are disabled", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const requirements = await getMidnightBundlesRequirements({
      viemClient: handle.client,
      chainId: midnightChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      supportSignature: false,
    });

    expect(requirements).toHaveLength(1);
    const approval = requirements[0];
    if (!isRequirementApproval(approval)) {
      throw new Error("Requirement is not an approval transaction");
    }
    expect(approval.action.args.spender).toBe(
      midnightAddresses.midnightBundles,
    );
    expect(approval.action.args.amount).toBe(1_000n);
  });

  test("behavior: returns ERC2612 permit when requested and supported", async () => {
    const handle = createMockClient(midnightTestChain);
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(handle, {
      address: midnightAddresses.loanToken,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 7n,
    });

    const requirements = await getMidnightBundlesRequirements({
      viemClient: handle.client,
      chainId: midnightChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      supportSignature: true,
      useSimplePermit: true,
    });

    expect(requirements).toHaveLength(1);
    const permit = requirements[0];
    if (!isRequirementSignature(permit)) {
      throw new Error("Requirement is not a signature requirement");
    }
    if (permit.action.type !== "permit") {
      throw new Error("Requirement is not an ERC2612 permit");
    }
    expect(permit.action.args.spender).toBe(midnightAddresses.midnightBundles);
  });

  test("behavior: returns Permit2 signature with optional approval", async () => {
    const handle = createMockClient(midnightTestChain);
    mockAllowanceReads({
      handle,
      directAllowance: 0n,
      permit2Allowance: 0n,
    });

    const requirements = await getMidnightBundlesRequirements({
      viemClient: handle.client,
      chainId: midnightChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      supportSignature: true,
    });

    expect(requirements).toHaveLength(2);
    const approval = requirements[0];
    const permit2 = requirements[1];
    if (!isRequirementApproval(approval)) {
      throw new Error("Requirement is not an approval transaction");
    }
    if (!isRequirementSignature(permit2)) {
      throw new Error("Requirement is not a signature requirement");
    }
    expect(approval.action.args.spender).toBe(midnightAddresses.permit2);
    expect(approval.action.args.amount).toBe(MathLib.MAX_UINT_160);
    if (permit2.action.type !== "permit2Transfer") {
      throw new Error("Requirement is not a Permit2 transfer signature");
    }
    expect(permit2.action.args.spender).toBe(midnightAddresses.midnightBundles);
  });

  test("behavior: returns classic approval when Permit2 is not deployed", async () => {
    const handle = createMockClient(noPermit2Chain);
    mockAllowanceReads({
      handle,
      chainId: noPermit2ChainId,
      directAllowance: 0n,
      permit2Allowance: 0n,
    });

    const requirements = await getMidnightBundlesRequirements({
      viemClient: handle.client,
      chainId: noPermit2ChainId,
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      supportSignature: true,
    });

    expect(requirements).toHaveLength(1);
    const approval = requirements[0];
    expect(isRequirementApproval(approval)).toBe(true);
    if (isRequirementApproval(approval)) {
      expect(approval.action.args.spender).toBe(
        midnightAddresses.midnightBundles,
      );
      expect(approval.action.args.amount).toBe(1_000n);
    }
  });

  test("behavior: skips ERC2612 simple permit for DAI", async () => {
    const handle = createMockClient(midnightTestChain);
    const reads = mockAllowanceReads({
      handle,
      token: midnightAddresses.dai,
      directAllowance: 0n,
      permit2Allowance: 0n,
      nonce: 7n,
    });
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (bytes: Uint8Array) => bytes.fill(1),
      },
    });

    try {
      const requirements = await getMidnightBundlesRequirements({
        viemClient: handle.client,
        chainId: midnightChainId,
        token: midnightAddresses.dai,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        supportSignature: true,
        useSimplePermit: true,
      });

      expect(reads.nonceReads).toBe(0);
      expect(requirements).toHaveLength(2);
      const approval = requirements[0];
      const permit2 = requirements[1];
      if (!isRequirementApproval(approval)) {
        throw new Error("Requirement is not an approval transaction");
      }
      if (!isRequirementSignature(permit2)) {
        throw new Error("Requirement is not a signature requirement");
      }
      expect(approval.action.args.spender).toBe(midnightAddresses.permit2);
      if (permit2.action.type !== "permit2Transfer") {
        throw new Error("Requirement is not a Permit2 transfer signature");
      }
      expect(permit2.action.args.spender).toBe(
        midnightAddresses.midnightBundles,
      );
    } finally {
      if (cryptoDescriptor == null) {
        Reflect.deleteProperty(globalThis, "crypto");
      } else {
        Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
      }
    }
  });

  test("error: CryptoUnavailableError", async () => {
    const handle = createMockClient(midnightTestChain);
    mockAllowanceReads({
      handle,
      directAllowance: 0n,
      permit2Allowance: 0n,
    });
    vi.stubGlobal("crypto", undefined);

    await expect(
      getMidnightBundlesRequirements({
        viemClient: handle.client,
        chainId: midnightChainId,
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        supportSignature: true,
      }),
    ).rejects.toThrow(CryptoUnavailableError);
  });
});
