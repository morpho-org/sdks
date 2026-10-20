import { type AccrualVault, getChainAddresses } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import {
  createMockClient,
  expectReadCall,
  mockRead,
} from "@morpho-org/test/mock";
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  serializeSignature,
  toHex,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import {
  signerAddress,
  signerWalletClient,
} from "../../../test/helpers/signer.js";
import { vaultBundlesV1Abi } from "../../abis.js";
import { morphoViemExtension } from "../../client/index.js";
import { DEFAULT_SLIPPAGE_TOLERANCE } from "../../constants.js";
import { computeVaultShareAllowanceCeiling } from "../../helpers/slippage.js";
import {
  type BundlesTokenRequirementSignature,
  type Erc2612RequirementSignature,
  isRequirementApproval,
  isRequirementSignature,
} from "../../types/index.js";

const amount = 100n;
const ALLOWANCE_SELECTOR = "0xdd62ed3e"; // allowance(address,address)

const MUTATED_ASSET = "0x0000000000000000000000000000000000002001";
const MUTATED_USER = "0x0000000000000000000000000000000000002002";

const countAllowanceReads = (
  handle: ReturnType<typeof createMockClient>,
): number =>
  handle.request.mock.calls.filter(([call]) => {
    if (call.method !== "eth_call") return false;
    const [request] = (call.params ?? []) as readonly [{ data?: string }];
    return request?.data?.startsWith(ALLOWANCE_SELECTOR) === true;
  }).length;

const mockShareAllowance = (
  handle: ReturnType<typeof createMockClient>,
  allowance: bigint,
) =>
  mockRead(handle, {
    address: IN_KIND_VAULT,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });

const approvedShareAmounts = async (handle: {
  readonly getRequirements: () => Promise<
    readonly Parameters<typeof isRequirementApproval>[0][]
  >;
}) =>
  (await handle.getRequirements())
    .filter(isRequirementApproval)
    .map(({ action }) => action.args.amount);

const prepareDeposit = (handle: ReturnType<typeof createMockClient>) =>
  handle.client
    .extend(morphoViemExtension())
    .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
    .deposit({
      amount,
      userAddress: IN_KIND_USER,
      vaultData: inKindVaultV1Data(),
    });

describe("MorphoVaultV1 deposit getRequirements", () => {
  test("behavior: concurrent callers share one requirement resolution", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const deposit = prepareDeposit(handle);

    const [first, second] = await Promise.all([
      deposit.getRequirements(),
      deposit.getRequirements(),
    ]);

    // One shared in-flight promise: concurrent callers share the same round of reads.
    expect(countAllowanceReads(handle)).toBe(1);
    expect(second).toBe(first);
    expect(
      first.filter(isRequirementApproval).map(({ action }) => action.args),
    ).toEqual([
      {
        spender: getChainAddress(mainnet.id, "bundles.vaultBundlesV1"),
        amount,
      },
    ]);
  });

  test("behavior: settled reads refresh the allowance after approval", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const deposit = prepareDeposit(handle);
    expect(await deposit.getRequirements()).toHaveLength(1);

    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: amount,
    });
    expect(await deposit.getRequirements()).toEqual([]);
    expect(countAllowanceReads(handle)).toBe(2);
    expect(() => deposit.buildTx()).not.toThrow();
  });

  test("behavior: concurrent options share a signature while later reads refresh its nonce", async () => {
    const handle = createMockClient(mainnet);
    const permit2 = getChainAddress(mainnet.id, "permit2");
    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: amount,
    });
    mockRead(handle, {
      address: permit2,
      abi: permit2Abi,
      functionName: "nonceBitmap",
      result: 0n,
    });
    const deposit = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
      .deposit({
        amount,
        userAddress: IN_KIND_USER,
        vaultData: inKindVaultV1Data(),
      });

    const [first, concurrent] = await Promise.all([
      deposit.getRequirements({ permit2Nonce: 0n }),
      deposit.getRequirements({ useSimplePermit: true, permit2Nonce: 1n }),
    ]);
    expect(concurrent).toBe(first);
    expect(countAllowanceReads(handle)).toBe(1);
    const requirement = first.find(isRequirementSignature);
    if (requirement?.action.type !== "permit2SignatureTransfer") {
      throw new Error("Permit2 SignatureTransfer requirement not found");
    }
    const signature = {
      action: requirement.action,
      args: {
        owner: IN_KIND_USER,
        asset: IN_KIND_ASSET,
        amount,
        nonce: requirement.action.args.nonce,
        deadline: requirement.action.args.deadline,
        signature: serializeSignature({
          r: toHex(1n, { size: 32 }),
          s: toHex(2n, { size: 32 }),
          yParity: 0,
        }),
      },
    } satisfies BundlesTokenRequirementSignature;
    expect(signature.args.nonce).toBe(0n);
    expect(() => deposit.buildTx([signature])).not.toThrow();

    // The old nonce is now consumed, so the next read must use the new options and live state.
    mockRead(handle, {
      address: permit2,
      abi: permit2Abi,
      functionName: "nonceBitmap",
      result: 1n,
    });
    const refreshed = await deposit.getRequirements({ permit2Nonce: 1n });
    const nextRequirement = refreshed.find(isRequirementSignature);
    if (nextRequirement?.action.type !== "permit2SignatureTransfer") {
      throw new Error("Permit2 SignatureTransfer requirement not found");
    }
    const nextAction = nextRequirement.action;
    expect(nextAction.args.nonce).toBe(1n);
    expect(countAllowanceReads(handle)).toBe(2);
    // The nonce is onchain state Permit2 verifies at execution, so the earlier
    // signature still finalizes.
    expect(() => deposit.buildTx([signature])).not.toThrow();
    expect(() =>
      deposit.buildTx([
        {
          action: nextAction,
          args: { ...signature.args, nonce: 1n },
        },
      ]),
    ).not.toThrow();
  });

  test("behavior: a signature prepared on one handle finalizes on a fresh handle", async () => {
    const permit2 = getChainAddress(mainnet.id, "permit2");
    const makeVault = () => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: IN_KIND_ASSET,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: permit2,
        abi: permit2Abi,
        functionName: "nonceBitmap",
        result: 0n,
      });
      return handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    };
    const params = {
      amount,
      userAddress: signerAddress,
      vaultData: inKindVaultV1Data(),
      deadline: Time.timestamp() + 7_200n,
    };
    const depositA = makeVault().deposit(params);

    const requirement = (await depositA.getRequirements()).find(
      isRequirementSignature,
    );
    if (requirement?.action.type !== "permit2SignatureTransfer") {
      throw new Error("Permit2 SignatureTransfer requirement not found");
    }
    const signature = await requirement.sign(signerWalletClient, signerAddress);

    const depositB = makeVault().deposit(params);
    expect(depositB.buildTx([signature])).toEqual(
      depositA.buildTx([signature]),
    );
  });

  test("behavior: a failed resolution is not cached", async () => {
    const handle = createMockClient(mainnet);
    const deposit = prepareDeposit(handle);

    // No allowance mock registered yet, so the first resolution fails.
    await expect(deposit.getRequirements()).rejects.toThrow();

    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: amount,
    });

    expect(await deposit.getRequirements()).toEqual([]);
  });

  test("behavior: snapshots the owner and asset used by the prepared handle", async () => {
    const handle = createMockClient(mainnet);
    const { permit2 } = getChainAddresses(mainnet.id);
    if (permit2 == null) throw new Error("Permit2 is not registered");
    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(handle, {
      address: permit2,
      abi: permit2Abi,
      functionName: "nonceBitmap",
      result: 0n,
    });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const params: {
      amount: bigint;
      userAddress: Address;
      vaultData: AccrualVault;
    } = {
      amount,
      userAddress: IN_KIND_USER,
      vaultData: inKindVaultV1Data(),
    };
    const deposit = vault.deposit(params);

    params.userAddress = MUTATED_USER;
    expect(Reflect.set(params.vaultData, "asset", MUTATED_ASSET)).toBe(true);

    const requirements = await deposit.getRequirements({ permit2Nonce: 0n });
    const signatureRequirement = requirements.find(isRequirementSignature);
    if (signatureRequirement?.action.type !== "permit2SignatureTransfer") {
      throw new Error("Permit2 SignatureTransfer requirement not found");
    }
    expect(
      expectReadCall(handle, {
        address: IN_KIND_ASSET,
        abi: erc20Abi,
        functionName: "allowance",
      })[0]?.args,
    ).toEqual([IN_KIND_USER, permit2]);

    const requirementSignature = {
      args: {
        owner: IN_KIND_USER,
        asset: IN_KIND_ASSET,
        amount,
        nonce: signatureRequirement.action.args.nonce,
        deadline: signatureRequirement.action.args.deadline,
        signature: serializeSignature({
          r: toHex(1n, { size: 32 }),
          s: toHex(2n, { size: 32 }),
          yParity: 0,
        }),
      },
      action: signatureRequirement.action,
    } satisfies BundlesTokenRequirementSignature;

    expect(deposit.buildTx([requirementSignature]).action.type).toBe(
      "vaultV1Deposit",
    );
  });

  test("error: an expired deadline rejects before any RPC request", async () => {
    vi.useFakeTimers();
    try {
      const handle = createMockClient(mainnet);
      const { ExpiredDeadlineError } = await import("../../types/index.js");
      const deadline = Time.timestamp() + 60n;
      const deposit = handle.client
        .extend(morphoViemExtension())
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
        .deposit({
          amount,
          userAddress: IN_KIND_USER,
          vaultData: inKindVaultV1Data(),
          deadline,
        });
      // Valid at handle creation, expired by requirement resolution.
      vi.setSystemTime((Number(deadline) + 60) * 1000);
      await expect(deposit.getRequirements()).rejects.toBeInstanceOf(
        ExpiredDeadlineError,
      );
      // The deadline is validated synchronously, ahead of the contract-code
      // check's eth_getCode and every requirement helper's reads.
      expect(handle.request.mock.calls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MorphoVaultV1 withdraw getRequirements", () => {
  test.each(["before requirements", "after requirements"] as const)(
    "behavior: snapshots withdrawal inputs %s are resolved",
    async (phase) => {
      const handle = createMockClient(mainnet);
      const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      const params = {
        amount,
        userAddress: IN_KIND_USER as Address,
        vaultData: inKindVaultV1Data(),
        deadline: Time.timestamp() + 7_200n,
      };
      const reference = vault.withdraw({ ...params });
      const referenceRequirement = (await reference.getRequirements()).find(
        isRequirementSignature,
      );
      if (referenceRequirement?.action.type !== "permit")
        throw new Error("Share permit requirement not found");
      const withdraw = vault.withdraw(params);
      if (phase === "after requirements") await withdraw.getRequirements();

      // Mutating caller-owned options must never change the prepared owner, assets, or share cap.
      params.amount = amount / 2n;
      params.userAddress = MUTATED_USER;
      const requirements = await withdraw.getRequirements();

      expect(requirements.find(isRequirementSignature)?.action).toEqual(
        referenceRequirement.action,
      );
      const allowanceReads = expectReadCall(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
      });
      expect(allowanceReads).toHaveLength(
        phase === "after requirements" ? 3 : 2,
      );
      expect(
        allowanceReads.every(
          ({ args }) => args?.[0] === IN_KIND_USER && args[1] === spender,
        ),
      ).toBe(true);
      const signature = {
        action: referenceRequirement.action,
        args: {
          owner: IN_KIND_USER,
          asset: IN_KIND_VAULT,
          amount: referenceRequirement.action.args.amount,
          deadline: params.deadline,
          nonce: 0n,
          signature: serializeSignature({
            r: toHex(1n, { size: 32 }),
            s: toHex(2n, { size: 32 }),
            yParity: 0,
          }),
        },
      } satisfies BundlesTokenRequirementSignature;
      expect(withdraw.buildTx([signature])).toEqual(
        reference.buildTx([signature]),
      );
      expect(withdraw.buildTx([signature]).action.args.amount).toBe(amount);
    },
  );

  const prepareWithdraw = (handle: ReturnType<typeof createMockClient>) => {
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    return {
      withdraw: vault.withdraw({
        amount,
        userAddress: IN_KIND_USER,
        vaultData: inKindVaultV1Data(),
      }),
    };
  };

  test("behavior: re-reads the share allowance after the approval is executed", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const { withdraw } = prepareWithdraw(handle);

    const [approval] = (await withdraw.getRequirements()).filter(
      isRequirementApproval,
    );
    const requiredShareAllowance = approval?.action.args.amount;
    if (requiredShareAllowance == null)
      throw new Error("Share approval requirement not found");

    // The caller executes that approval. Replaying a memoized requirement here would leave the
    // documented first-time withdrawal flow permanently unresolvable.
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: requiredShareAllowance,
    });

    expect(await withdraw.getRequirements()).toEqual([]);
  });

  test("behavior: accepts a stale allowance within one slippage tolerance above the cap", async () => {
    const handle = createMockClient(mainnet);
    mockShareAllowance(handle, 0n);
    const withdraw = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
      .withdraw({
        amount: 10n ** 12n,
        userAddress: IN_KIND_USER,
        vaultData: inKindVaultV1Data(),
      });
    const [requiredShareAllowance] = await approvedShareAmounts(withdraw);
    if (requiredShareAllowance == null)
      throw new Error("Share approval requirement not found");
    const maxShareAllowance = computeVaultShareAllowanceCeiling({
      requiredShareAllowance,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    expect(maxShareAllowance).toBeGreaterThan(requiredShareAllowance);

    mockShareAllowance(handle, maxShareAllowance);
    expect(await withdraw.getRequirements()).toEqual([]);

    mockShareAllowance(handle, maxShareAllowance + 1n);
    expect(await approvedShareAmounts(withdraw)).toEqual([
      requiredShareAllowance,
    ]);
  });

  test("behavior: pins the derived share cap across re-resolutions", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const { withdraw } = prepareWithdraw(handle);

    const first = await withdraw.getRequirements();
    const second = await withdraw.getRequirements();

    // Re-reading the allowance must not retarget the cap derived from `vaultData` at creation.
    expect(countAllowanceReads(handle)).toBe(2);
    expect(
      second.filter(isRequirementApproval).map(({ action }) => action.args),
    ).toEqual(
      first.filter(isRequirementApproval).map(({ action }) => action.args),
    );
  });

  test("behavior: drops a signed permit once the allowance becomes oversized", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 0n,
    });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const withdraw = vault.withdraw({
      amount,
      userAddress: IN_KIND_USER,
      vaultData: inKindVaultV1Data(),
      deadline: Time.timestamp() + 7_200n,
    });
    const permit = (await withdraw.getRequirements()).find(
      isRequirementSignature,
    );
    if (permit?.action.type !== "permit")
      throw new Error("Share permit requirement not found");
    const signature = {
      action: permit.action,
      args: {
        owner: IN_KIND_USER,
        asset: IN_KIND_VAULT,
        amount: permit.action.args.amount,
        nonce: 0n,
        deadline: permit.action.args.deadline,
        signature: serializeSignature({
          r: toHex(1n, { size: 32 }),
          s: toHex(2n, { size: 32 }),
          yParity: 0,
        }),
      },
    } satisfies BundlesTokenRequirementSignature;
    expect(() => withdraw.buildTx([signature])).not.toThrow();

    // An oversized allowance is reset onchain. The earlier permit still encodes in `buildTx()`
    // since it matches the cap derived from `vaultData`; if its nonce is consumed onchain,
    // VaultBundlesV1 skips it and burns under the live allowance, so the caller must execute
    // the latest requirements (the reset) before submitting.
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: permit.action.args.amount + 1n,
    });
    const requirements = await withdraw.getRequirements();
    expect(requirements.find(isRequirementSignature)).toBeUndefined();
    expect(
      requirements
        .filter(isRequirementApproval)
        .map(({ action }) => action.args),
    ).toEqual([expect.objectContaining({ amount: permit.action.args.amount })]);
    expect(() => withdraw.buildTx([signature])).not.toThrow();
  });

  test("behavior: a signature prepared on one handle finalizes on a fresh handle", async () => {
    const makeVault = () => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      return handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    };
    const params = {
      amount,
      userAddress: signerAddress,
      vaultData: inKindVaultV1Data(),
      deadline: Time.timestamp() + 7_200n,
    };
    const withdrawA = makeVault().withdraw(params);

    const permit = (await withdrawA.getRequirements()).find(
      isRequirementSignature,
    );
    if (permit?.action.type !== "permit")
      throw new Error("Share permit requirement not found");
    const signature = await permit.sign(signerWalletClient, signerAddress);

    const withdrawB = makeVault().withdraw(params);
    expect(withdrawB.buildTx([signature])).toEqual(
      withdrawA.buildTx([signature]),
    );

    // A permit signed for any amount between the derived share cap and the cap divided by
    // `1 - slippageTolerance` is accepted; one above that ceiling is rejected.
    const maxShareAllowance = computeVaultShareAllowanceCeiling({
      requiredShareAllowance: permit.action.args.amount,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const permitAction = permit.action;
    if (permitAction.type !== "permit")
      throw new Error("Share permit requirement not found");
    const permitArgs = permitAction.args;
    const oversizedSignature = (
      signedAmount: bigint,
    ): Erc2612RequirementSignature => ({
      action: {
        ...permitAction,
        args: { ...permitArgs, amount: signedAmount },
      },
      args: {
        owner: signerAddress,
        asset: IN_KIND_VAULT,
        amount: signedAmount,
        nonce: permitArgs.nonce ?? 0n,
        deadline: permitArgs.deadline,
        signature: signature.args.signature,
      },
    });
    expect(() =>
      withdrawB.buildTx([oversizedSignature(maxShareAllowance)]),
    ).not.toThrow();
    expect(() =>
      withdrawB.buildTx([oversizedSignature(maxShareAllowance + 1n)]),
    ).toThrowError(
      expect.objectContaining({
        name: "BundlesPermitMismatchError",
        field: "amount",
      }),
    );
  });

  test("behavior: a permit signed on an earlier snapshot finalizes on a fresher handle", async () => {
    const largerAmount = 10_000_000n;
    const makeVault = () => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      return handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    };
    const deadline = Time.timestamp() + 7_200n;
    const withdrawA = makeVault().withdraw({
      amount: largerAmount,
      userAddress: signerAddress,
      vaultData: inKindVaultV1Data(),
      deadline,
    });

    const permit = (await withdrawA.getRequirements()).find(
      isRequirementSignature,
    );
    if (permit?.action.type !== "permit")
      throw new Error("Share permit requirement not found");
    const signature = await permit.sign(signerWalletClient, signerAddress);
    const signedAmount = permit.action.args.amount;

    // A fresher snapshot prices shares slightly higher, so it derives a smaller cap: the permit
    // signed for the earlier, larger cap stays within `[cap, cap / (1 - slippageTolerance)]`.
    const fresherShares = 9_997_002n;
    const fresherVaultData = {
      address: IN_KIND_VAULT,
      asset: IN_KIND_ASSET,
      toShares: () => fresherShares,
      accrueInterest: () => ({ toShares: () => fresherShares }),
    } as never;
    const withdrawB = makeVault().withdraw({
      amount: largerAmount,
      userAddress: signerAddress,
      vaultData: fresherVaultData,
      deadline,
    });

    const tx = withdrawB.buildTx([signature]);
    const decoded = decodeFunctionData({
      abi: vaultBundlesV1Abi,
      data: tx.data,
    });
    expect(decoded.functionName).toBe("vaultBundlesV1Withdraw");
    expect(decoded.args?.[3]).toMatchObject({ value: signedAmount });
  });
});

describe("MorphoVaultV1 redeem getRequirements", () => {
  test.each(["redeem", "migration assets", "migration shares"] as const)(
    "behavior: %s refreshes allowances and nonces while signed permits stay usable",
    async (operation) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV1Data());
      const prepared =
        operation === "redeem"
          ? vault.redeem({ shares: amount, userAddress: IN_KIND_USER })
          : vault.migrateToV2({
              ...(operation === "migration assets"
                ? { assets: amount }
                : { shares: amount }),
              userAddress: IN_KIND_USER,
              sourceVault: inKindVaultV1Data(),
              targetVault: inKindVaultV2Data({ address: MUTATED_USER }),
            });
      const first = (await prepared.getRequirements()).find(
        isRequirementSignature,
      );
      if (first?.action.type !== "permit")
        throw new Error("Share permit requirement not found");
      const signature = {
        action: first.action,
        args: {
          owner: IN_KIND_USER,
          asset: IN_KIND_VAULT,
          amount: first.action.args.amount,
          nonce: 0n,
          deadline: first.action.args.deadline,
          signature: serializeSignature({
            r: toHex(1n, { size: 32 }),
            s: toHex(2n, { size: 32 }),
            yParity: 0,
          }),
        },
      } satisfies Erc2612RequirementSignature;
      expect(() => prepared.buildTx([signature])).not.toThrow();

      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 1n,
      });
      const refreshed = (await prepared.getRequirements()).find(
        isRequirementSignature,
      );
      if (refreshed?.action.type !== "permit")
        throw new Error("Share permit requirement not found");
      expect(refreshed.action.args.nonce).toBe(1n);
      // A consumed nonce is not an encoding error: the spender skips the permit onchain and
      // proceeds under the live allowance, so the earlier signature still finalizes.
      expect(() => prepared.buildTx([signature])).not.toThrow();
      const refreshedSignature = {
        action: refreshed.action,
        args: { ...signature.args, nonce: 1n },
      } satisfies Erc2612RequirementSignature;
      expect(() => prepared.buildTx([refreshedSignature])).not.toThrow();

      // Simulate the refreshed permit being consumed and establishing the exact allowance.
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: first.action.args.amount,
      });
      expect(await prepared.getRequirements()).toEqual([]);
      expect(() => prepared.buildTx([refreshedSignature])).not.toThrow();
      expect(() => prepared.buildTx()).not.toThrow();

      // Revoking that allowance must make the requirement outstanding again.
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      expect(await prepared.getRequirements()).toHaveLength(1);
      expect(countAllowanceReads(handle)).toBe(4);
    },
  );

  test.each([
    { mutationTiming: "before", supportSignature: false },
    { mutationTiming: "after", supportSignature: false },
    { mutationTiming: "before", supportSignature: true },
    { mutationTiming: "after", supportSignature: true },
  ])(
    "behavior: snapshots inputs mutated $mutationTiming requirements (supportSignature=$supportSignature)",
    async ({ mutationTiming, supportSignature }) => {
      const handle = createMockClient(mainnet);
      const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV1Data());
      const params: { shares: bigint; userAddress: Address } = {
        shares: amount,
        userAddress: IN_KIND_USER,
      };
      const redeem = vault.redeem(params);
      const originalTx = redeem.buildTx();

      if (mutationTiming === "before") {
        params.shares = amount * 2n;
        params.userAddress = MUTATED_USER;
      }
      const requirements = await redeem.getRequirements();
      if (mutationTiming === "after") {
        params.shares = amount * 2n;
        params.userAddress = MUTATED_USER;
      }

      expect(
        expectReadCall(handle, {
          address: IN_KIND_VAULT,
          abi: erc20Abi,
          functionName: "allowance",
        })[0]?.args,
      ).toEqual([IN_KIND_USER, spender]);
      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action.args).toMatchObject({
        amount,
        spender,
      });
      expect(
        (await redeem.getRequirements()).map(({ action }) => action),
      ).toEqual(requirements.map(({ action }) => action));
      expect(redeem.buildTx()).toEqual(originalTx);

      if (supportSignature) {
        const requirement = requirements.find(isRequirementSignature);
        if (requirement?.action.type !== "permit") {
          throw new Error("Share permit requirement not found");
        }
        const signature = {
          action: requirement.action,
          args: {
            owner: IN_KIND_USER,
            asset: IN_KIND_VAULT,
            amount,
            nonce: 0n,
            deadline: requirement.action.args.deadline,
            signature: serializeSignature({
              r: toHex(1n, { size: 32 }),
              s: toHex(2n, { size: 32 }),
              yParity: 0,
            }),
          },
        } satisfies Erc2612RequirementSignature;
        expect(redeem.buildTx([signature]).action).toEqual(originalTx.action);
      } else {
        expect(requirements.filter(isRequirementApproval)).toHaveLength(1);
      }
    },
  );

  test("behavior: a signature prepared on one handle finalizes on a fresh handle", async () => {
    const makeVault = () => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV1Data());
      return vault;
    };
    const params = {
      shares: amount,
      userAddress: signerAddress,
      deadline: Time.timestamp() + 7_200n,
    };
    const redeemA = makeVault().redeem(params);

    const permit = (await redeemA.getRequirements()).find(
      isRequirementSignature,
    );
    if (permit?.action.type !== "permit")
      throw new Error("Share permit requirement not found");
    const signature = await permit.sign(signerWalletClient, signerAddress);

    const redeemB = makeVault().redeem(params);
    expect(redeemB.buildTx([signature])).toEqual(redeemA.buildTx([signature]));
  });
});

describe("MorphoVaultV1 migrateToV2 getRequirements", () => {
  test.each([
    { mode: "assets", timing: "before", mutation: "fields" },
    { mode: "assets", timing: "after", mutation: "fields" },
    { mode: "shares", timing: "before", mutation: "fields" },
    { mode: "shares", timing: "after", mutation: "fields" },
    { mode: "assets", timing: "before", mutation: "objects" },
    { mode: "assets", timing: "after", mutation: "objects" },
    { mode: "shares", timing: "before", mutation: "objects" },
    { mode: "shares", timing: "after", mutation: "objects" },
  ] as const)(
    "behavior: snapshots $mode migration $mutation mutated $timing requirements",
    async ({ mode, timing, mutation }) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      const params = {
        ...(mode === "assets" ? { assets: amount } : { shares: amount }),
        userAddress: IN_KIND_USER as Address,
        sourceVault: inKindVaultV1Data(),
        targetVault: inKindVaultV2Data({ address: MUTATED_USER }),
      };
      const migration = vault.migrateToV2(params);
      const originalTx = migration.buildTx();
      if (timing === "after") await migration.getRequirements();

      params.userAddress = MUTATED_USER;
      if (mutation === "fields") {
        Object.assign(params.sourceVault, {
          address: MUTATED_USER,
          asset: MUTATED_ASSET,
        });
        Object.assign(params.targetVault, {
          address: IN_KIND_VAULT,
          asset: MUTATED_ASSET,
        });
      } else {
        params.sourceVault = inKindVaultV1Data({ address: MUTATED_USER });
        params.targetVault = inKindVaultV2Data({ address: IN_KIND_VAULT });
      }

      const requirements = await migration.getRequirements();
      const permit = requirements.find(isRequirementSignature);
      if (permit?.action.type !== "permit")
        throw new Error("Share permit requirement not found");
      const allowanceReads = expectReadCall(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
      });
      expect(allowanceReads).toHaveLength(timing === "after" ? 2 : 1);
      expect(
        allowanceReads.every(({ args }) => args?.[0] === IN_KIND_USER),
      ).toBe(true);
      expect(migration.buildTx()).toEqual(originalTx);
      const signature = {
        action: permit.action,
        args: {
          owner: IN_KIND_USER,
          asset: IN_KIND_VAULT,
          amount: permit.action.args.amount,
          nonce: 0n,
          deadline: permit.action.args.deadline,
          signature: serializeSignature({
            r: toHex(1n, { size: 32 }),
            s: toHex(2n, { size: 32 }),
            yParity: 0,
          }),
        },
      } satisfies Erc2612RequirementSignature;
      expect(migration.buildTx([signature]).action).toEqual(originalTx.action);
    },
  );

  const MIGRATION_TARGET_VAULT =
    "0x0000000000000000000000000000000000002003" as const;
  const migrationSnapshot = (address: Address, shares: bigint) =>
    ({
      address,
      asset: IN_KIND_ASSET,
      toShares: () => shares,
      accrueInterest: () => ({ toShares: () => shares }),
    }) as never;

  const prepareMigration = (handle: ReturnType<typeof createMockClient>) =>
    handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
      .migrateToV2({
        assets: amount,
        userAddress: IN_KIND_USER,
        sourceVault: migrationSnapshot(IN_KIND_VAULT, 10n),
        targetVault: migrationSnapshot(MIGRATION_TARGET_VAULT, 100n),
        slippageTolerance: 0n,
      });

  test("behavior: assets mode accepts an allowance within one slippage tolerance above the cap", async () => {
    const handle = createMockClient(mainnet);
    mockShareAllowance(handle, 0n);
    const slippageTolerance = 10n ** 16n;
    const migration = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
      .migrateToV2({
        assets: 10n ** 12n,
        userAddress: IN_KIND_USER,
        sourceVault: migrationSnapshot(IN_KIND_VAULT, 10n ** 12n),
        targetVault: migrationSnapshot(MIGRATION_TARGET_VAULT, 10n ** 12n),
        slippageTolerance,
      });
    const [requiredShareAllowance] = await approvedShareAmounts(migration);
    if (requiredShareAllowance == null)
      throw new Error("Share approval requirement not found");
    const maxShareAllowance = computeVaultShareAllowanceCeiling({
      requiredShareAllowance,
      slippageTolerance: slippageTolerance,
    });

    mockShareAllowance(handle, maxShareAllowance);
    expect(await migration.getRequirements()).toEqual([]);

    mockShareAllowance(handle, maxShareAllowance + 1n);
    expect(await approvedShareAmounts(migration)).toEqual([
      requiredShareAllowance,
    ]);
  });

  test("behavior: shares mode still requires an exact allowance", async () => {
    const handle = createMockClient(mainnet);
    const shares = 10n ** 12n;
    mockShareAllowance(handle, shares + 1n);
    const migration = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
      .migrateToV2({
        shares,
        userAddress: IN_KIND_USER,
        // Shares mode converts through the accrued source vault instead of the share-cap preview.
        sourceVault: {
          address: IN_KIND_VAULT,
          asset: IN_KIND_ASSET,
          allocations: new Map(),
          accrueInterest: () => ({ toAssets: () => shares }),
        } as never,
        targetVault: migrationSnapshot(MIGRATION_TARGET_VAULT, shares),
        slippageTolerance: 10n ** 16n,
      });

    expect(await approvedShareAmounts(migration)).toEqual([shares]);
  });

  test("behavior: re-reads the share allowance after the approval is executed", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const migration = prepareMigration(handle);

    const [approval] = (await migration.getRequirements()).filter(
      isRequirementApproval,
    );
    const requiredShareAllowance = approval?.action.args.amount;
    if (requiredShareAllowance == null)
      throw new Error("Share approval requirement not found");

    // Assets-mode calldata carries no share limit, so this allowance is the sole cap on the burn.
    // Replaying a memoized requirement would hide both a satisfied approval and a later change.
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: requiredShareAllowance,
    });

    expect(await migration.getRequirements()).toEqual([]);
    expect(countAllowanceReads(handle)).toBe(2);
  });

  test("behavior: pins the derived share cap across re-resolutions", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const migration = prepareMigration(handle);

    const first = await migration.getRequirements();

    // A larger leftover allowance must resurface as an outstanding requirement for the cap this
    // handle already committed to, never satisfy it.
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: amount,
    });

    expect(
      (await migration.getRequirements())
        .filter(isRequirementApproval)
        .map(({ action }) => action.args),
    ).toEqual(
      first.filter(isRequirementApproval).map(({ action }) => action.args),
    );
  });

  test("behavior: a signature prepared on one handle finalizes on a fresh handle", async () => {
    const makeVault = () => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: IN_KIND_VAULT,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV1Data());
      return vault;
    };
    const params = {
      assets: amount,
      userAddress: signerAddress,
      sourceVault: inKindVaultV1Data(),
      targetVault: inKindVaultV2Data({ address: MUTATED_USER }),
      deadline: Time.timestamp() + 7_200n,
    };
    const migrationA = makeVault().migrateToV2(params);

    const permit = (await migrationA.getRequirements()).find(
      isRequirementSignature,
    );
    if (permit?.action.type !== "permit")
      throw new Error("Share permit requirement not found");
    const signature = await permit.sign(signerWalletClient, signerAddress);

    const migrationB = makeVault().migrateToV2(params);
    expect(migrationB.buildTx([signature])).toEqual(
      migrationA.buildTx([signature]),
    );
  });
});

describe("MorphoVaultV1 missing contract code", () => {
  test("error: deposit fails closed on a code-less target before any downstream read", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_getCode") return "0x";
      throw new Error(`unhandled RPC ${method}`);
    });
    const { expectFailClosed } = await import("@morpho-org/test/chaos");
    const { MissingContractCodeError } = await import("../../types/index.js");
    const promise = prepareDeposit(handle).getRequirements();
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(0);
  });

  test("error: a wrong-chain RPC surfaces ChainIdMismatchError, not missing code", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_getCode") return "0x";
      throw new Error(`unhandled RPC ${method}`);
    });
    const { expectFailClosed } = await import("@morpho-org/test/chaos");
    const { ChainIdMismatchError, MissingContractCodeError } = await import(
      "../../types/index.js"
    );
    const promise = prepareDeposit(handle).getRequirements();
    await expectFailClosed(promise, "chain");
    await expect(promise).rejects.toBeInstanceOf(ChainIdMismatchError);
    await expect(promise).rejects.not.toBeInstanceOf(MissingContractCodeError);
  });

  test.each(["withdraw", "redeem"] as const)(
    "error: %s fails closed on a code-less target before any downstream read",
    async (method) => {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementation(async ({ method: rpcMethod }) => {
        if (rpcMethod === "eth_chainId") return "0x1";
        if (rpcMethod === "eth_getCode") return "0x";
        throw new Error(`unhandled RPC ${rpcMethod}`);
      });
      const { expectFailClosed } = await import("@morpho-org/test/chaos");
      const { MissingContractCodeError } = await import("../../types/index.js");
      const vault = handle.client
        .extend(morphoViemExtension())
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      const action =
        method === "withdraw"
          ? vault.withdraw({
              amount,
              userAddress: IN_KIND_USER,
              vaultData: inKindVaultV1Data(),
            })
          : vault.redeem({ shares: amount, userAddress: IN_KIND_USER });
      const promise = action.getRequirements();
      await expectFailClosed(promise, "config");
      await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
      await expect(promise).rejects.toMatchObject({
        role: "bundles.vaultBundlesV1",
      });
      expect(
        handle.request.mock.calls.filter(
          ([call]) => call.method === "eth_call",
        ),
      ).toHaveLength(0);
    },
  );

  test("error: a natively funded deposit fails closed on a code-less target", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method: rpcMethod }) => {
      if (rpcMethod === "eth_chainId") return "0x1";
      if (rpcMethod === "eth_getCode") return "0x";
      throw new Error(`unhandled RPC ${rpcMethod}`);
    });
    const { expectFailClosed } = await import("@morpho-org/test/chaos");
    const { MissingContractCodeError } = await import("../../types/index.js");
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const vaultData = inKindVaultV1Data();
    expect(
      Reflect.set(vaultData, "asset", getChainAddress(mainnet.id, "wNative")),
    ).toBe(true);
    const promise = vault
      .deposit({
        nativeAmount: amount,
        userAddress: IN_KIND_USER,
        vaultData,
      })
      .getRequirements();
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(promise).rejects.toMatchObject({
      role: "bundles.vaultBundlesV1",
    });
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(0);
  });

  test("error: migrateToV2 fails closed on a code-less target before any downstream read", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method: rpcMethod }) => {
      if (rpcMethod === "eth_chainId") return "0x1";
      if (rpcMethod === "eth_getCode") return "0x";
      throw new Error(`unhandled RPC ${rpcMethod}`);
    });
    const { expectFailClosed } = await import("@morpho-org/test/chaos");
    const { MissingContractCodeError } = await import("../../types/index.js");
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const sourceVault = inKindVaultV1Data();
    const promise = vault
      .migrateToV2({
        userAddress: IN_KIND_USER,
        sourceVault,
        targetVault: inKindVaultV2Data({
          address: "0x1111111111111111111111111111111111111111",
        }),
        shares: sourceVault.totalSupply,
        deadline: Time.timestamp() + Time.s.from.h(1n),
        slippageTolerance: 0n,
      })
      .getRequirements();
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(promise).rejects.toMatchObject({
      role: "bundles.vaultBundlesV1",
    });
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(0);
  });

  test("error: the exit flow reports a code-less blue", async () => {
    const handle = createMockClient(mainnet);
    const defaultImpl = handle.request.getMockImplementation();
    const blue = getChainAddress(mainnet.id, "blue");
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_getCode") return params?.[0] === blue ? "0x" : "0x01";
      if (method === "eth_chainId") return "0x1";
      return defaultImpl?.({ method, params });
    });
    const { expectFailClosed } = await import("@morpho-org/test/chaos");
    const { MissingContractCodeError } = await import("../../types/index.js");
    const promise = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
      .inKindRedeem({
        amount,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(promise).rejects.toMatchObject({ role: "blue" });
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(0);
  });

  test("behavior: a code-full deposit sends exactly one eth_chainId", async () => {
    const handle = createMockClient(mainnet);
    const defaultImpl = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_call") return `0x${"0".repeat(64)}`;
      return defaultImpl?.({ method, params });
    });
    await prepareDeposit(handle).getRequirements();
    expect(
      handle.request.mock.calls.filter(
        ([call]) => call.method === "eth_chainId",
      ),
    ).toHaveLength(1);
  });
});
