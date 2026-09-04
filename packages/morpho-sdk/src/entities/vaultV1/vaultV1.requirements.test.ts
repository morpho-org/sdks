import { type AccrualVault, getChainAddresses } from "@morpho-org/blue-sdk";
import { permit2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
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
  inKindVaultV1Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  type BundlesTokenRequirementSignature,
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
});

describe("MorphoVaultV1 withdraw getRequirements", () => {
  const prepareWithdraw = (handle: ReturnType<typeof createMockClient>) => {
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const getData = vi
      .spyOn(vault, "getData")
      .mockResolvedValue(inKindVaultV1Data());
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
