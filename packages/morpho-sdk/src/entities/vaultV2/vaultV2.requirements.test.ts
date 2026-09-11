import { type AccrualVaultV2, getChainAddresses } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import {
  createMockClient,
  expectReadCall,
  mockRead,
} from "@morpho-org/test/mock";
import { type Address, erc20Abi, serializeSignature, toHex } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  BundlesPermitMismatchError,
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

const prepareDeposit = (handle: ReturnType<typeof createMockClient>) =>
  handle.client
    .extend(morphoViemExtension())
    .morpho.vaultV2(IN_KIND_VAULT, mainnet.id)
    .deposit({
      amount,
      userAddress: IN_KIND_USER,
      vaultData: inKindVaultV2Data(),
    });

describe("MorphoVaultV2 deposit getRequirements", () => {
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

    // One shared in-flight promise. A second concurrent resolution would overwrite
    // the captured requirement, making `buildTx()` reject the other caller's signature.
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
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id)
      .deposit({
        amount,
        userAddress: IN_KIND_USER,
        vaultData: inKindVaultV2Data(),
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
    expect(() => deposit.buildTx([signature])).toThrow(
      BundlesPermitMismatchError,
    );
    expect(() =>
      deposit.buildTx([
        {
          action: nextAction,
          args: { ...signature.args, nonce: 1n },
        },
      ]),
    ).not.toThrow();
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
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const params: {
      amount: bigint;
      userAddress: Address;
      vaultData: AccrualVaultV2;
    } = {
      amount,
      userAddress: IN_KIND_USER,
      vaultData: inKindVaultV2Data(),
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
      "vaultV2Deposit",
    );
  });
});

describe("MorphoVaultV2 redeem getRequirements", () => {
  test.each(["redeem"] as const)(
    "behavior: %s refreshes allowances and nonces and rejects consumed permits",
    async () => {
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
        .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
      vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV2Data());
      const prepared = vault.redeem({
        shares: amount,
        userAddress: IN_KIND_USER,
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
      expect(() => prepared.buildTx([signature])).toThrow(
        BundlesPermitMismatchError,
      );
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
      expect(() => prepared.buildTx([refreshedSignature])).toThrow(
        BundlesPermitMismatchError,
      );
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
        .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
      vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV2Data());
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

  test("behavior: re-reads the share allowance after the approval is executed", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV2Data());
    const redeem = vault.redeem({ shares: amount, userAddress: IN_KIND_USER });

    expect(await redeem.getRequirements()).toHaveLength(1);

    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: amount,
    });

    expect(await redeem.getRequirements()).toEqual([]);
    expect(countAllowanceReads(handle)).toBe(2);
  });
});

describe("MorphoVaultV2 withdraw getRequirements", () => {
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
        .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
      vi.spyOn(vault, "getData").mockResolvedValue(inKindVaultV2Data());
      const params = {
        amount,
        userAddress: IN_KIND_USER as Address,
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
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const getData = vi
      .spyOn(vault, "getData")
      .mockResolvedValue(inKindVaultV2Data());
    return {
      getData,
      withdraw: vault.withdraw({ amount, userAddress: IN_KIND_USER }),
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

  test("behavior: pins the derived share cap across re-resolutions", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const { getData, withdraw } = prepareWithdraw(handle);

    const first = await withdraw.getRequirements();
    const second = await withdraw.getRequirements();

    // Re-reading the allowance must not retarget the cap this handle already committed to, so
    // the vault snapshot it was derived from is fetched exactly once.
    expect(getData).toHaveBeenCalledTimes(1);
    expect(countAllowanceReads(handle)).toBe(2);
    expect(
      second.filter(isRequirementApproval).map(({ action }) => action.args),
    ).toEqual(
      first.filter(isRequirementApproval).map(({ action }) => action.args),
    );
  });
});
