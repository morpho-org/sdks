import { fc, test } from "@fast-check/vitest";
import { Token } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256 } from "viem";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { assert, describe, expect, expectTypeOf } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
} from "../../../test/fixtures/inKindRedeem.js";
import {
  signerAddress,
  signerWalletClient,
} from "../../../test/helpers/signer.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import {
  type Action,
  applySignatures,
  buildTransaction,
  buildTransactions,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  getPendingSignatureRequests,
  IncompleteTransactionPlanError,
  InputExceedsMaxError,
  InvalidTransactionPlanError,
  NonPositiveInputError,
  parseTransactionPlan,
  prepareVaultV1Redeem,
  serializeTransactionPlan,
  type Transaction,
  type TransactionPlan,
  TransactionPlanSignatureMismatchError,
  UnsupportedTransactionPlanActionError,
  UnsupportedTransactionPlanVersionError,
  type VaultV1RedeemAction,
  type VaultV1RedeemPlanParams,
  vaultV1Redeem,
} from "../../index.js";
import { getVaultPermit } from "../permit.js";

const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
const params: VaultV1RedeemPlanParams = {
  shareToken: new Token({ address: IN_KIND_VAULT, name: "Vault shares" }),
  chainId: mainnet.id,
  account: signerAddress,
  shares: 100n,
  expiresAt: 2_000_000_000,
};

test.each([
  { explicitNow: true, customExpiry: false },
  { explicitNow: true, customExpiry: true },
  { explicitNow: false, customExpiry: false },
  { explicitNow: false, customExpiry: true },
])(
  "redemption uses reference time with explicitNow=$explicitNow and customExpiry=$customExpiry",
  async ({ explicitNow, customExpiry }) => {
    const chainNow = 1_700_000_000n;
    const deviceNow = chainNow + 10_800n;
    const now = explicitNow ? chainNow : deviceNow;
    const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
    const mock = mockShares(maxUint256);
    const preparation = withChainTimestamp(deviceNow, () =>
      prepareVaultV1Redeem(mock.client, {
        ...params,
        now: explicitNow ? chainNow : undefined,
        expiresAt,
      }),
    );
    if (!explicitNow && customExpiry) {
      await expect(preparation).rejects.toThrow(ExpiredDeadlineError);
      expect(mock.request).not.toHaveBeenCalled();
      return;
    }
    const plan = await preparation;
    const expectedExpiry = expiresAt ?? Number(now + 7_200n);
    expect(plan.expiresAt).toBe(expectedExpiry);
    expect(plan.steps.at(-1)?.action.inputs).toMatchObject({
      deadline: BigInt(expectedExpiry),
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(buildTransactions(plan)).toHaveLength(1);
  },
);

function mockShares(allowance = 0n) {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: IN_KIND_VAULT,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });
  mockRead(handle, {
    address: IN_KIND_VAULT,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 3n,
  });
  return handle;
}

describe("Vault V1 redeem TransactionPlan", () => {
  test("exports the preparation function and params from the consumer barrel", () => {
    expect(prepareVaultV1Redeem).toBeTypeOf("function");
    expectTypeOf<
      Extract<Action, { type: "vaultV1Redeem" }>["inputs"]["shares"]
    >().toEqualTypeOf<bigint>();
    expectTypeOf<ReturnType<typeof buildTransactions>>().toEqualTypeOf<
      readonly Readonly<Transaction>[]
    >();
  });

  test.each([false, true])(
    "reuses an exact allowance with supportSignature=%s without reading a nonce",
    async (supportSignature) => {
      const handle = mockShares(params.shares);
      const plan = await prepareVaultV1Redeem(handle.client, {
        ...params,
        supportSignature,
      });
      expect(plan.steps.map(({ id }) => id)).toEqual(["vaultV1Redeem"]);
      expect(plan.signatureRequests).toEqual([]);
      expect(
        handle.request.mock.calls.filter(
          ([call]) => call.method === "eth_call",
        ),
      ).toHaveLength(1);
      expect(buildTransactions(plan)[0]?.to).toBe(spender);
      expect(Object.isFrozen(plan)).toBe(true);
    },
  );

  test("defaults to a direct infinite Bundler approval", async () => {
    const handle = mockShares();
    const plan = await prepareVaultV1Redeem(handle.client, params);
    expect(plan.steps.map(({ id }) => id)).toEqual([
      "vaultV1Redeem:approval",
      "vaultV1Redeem",
    ]);
    expect(plan.steps[0]?.action).toEqual({
      type: "erc20Approval",
      inputs: {
        token: IN_KIND_VAULT,
        spender,
        shares: maxUint256,
        chainId: params.chainId,
        account: params.account,
      },
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(buildTransactions(plan).map(({ to }) => to)).toEqual([
      IN_KIND_VAULT,
      spender,
    ]);
    expect(applySignatures(plan, [])).toEqual(plan);
  });

  test("uses an unlimited V1 share permit with signature support", async () => {
    const plan = await prepareVaultV1Redeem(mockShares().client, {
      ...params,
      supportSignature: true,
    });
    expect(plan.steps.map(({ id }) => id)).toEqual(["vaultV1Redeem"]);
    expect(plan.signatureRequests).toMatchObject([
      {
        id: "vaultV1Redeem:tokenPermit",
        kind: "permit",
        args: {
          spender,
          amount: maxUint256,
          nonce: 3n,
          deadline: BigInt(params.expiresAt!),
        },
        typedData: { message: { value: maxUint256 } },
      },
    ]);
    expect(plan.signatureRequests[0]?.typedData.domain).toMatchObject({
      name: "Vault shares",
      chainId: mainnet.id,
      verifyingContract: IN_KIND_VAULT,
    });
  });

  test.each(["missing request", "missing signature"])(
    "rejects a %s with its dependency kind and ID",
    async (missing) => {
      const plan = await prepareVaultV1Redeem(mockShares().client, {
        ...params,
        supportSignature: true,
      });
      const incomplete =
        missing === "missing request"
          ? { ...plan, signatureRequests: [] }
          : plan;
      let error: unknown;
      try {
        buildTransactions(incomplete);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(IncompleteTransactionPlanError);
      expect(error).toMatchObject({
        kind: "signature",
        id: "vaultV1Redeem:tokenPermit",
      });
    },
  );

  test.each(["version", "action"] as const)(
    "rejects an unknown %s in every plan-reading helper",
    async (field) => {
      const handle = mockShares();
      const plan = await prepareVaultV1Redeem(handle.client, {
        ...params,
        supportSignature: true,
      });
      const serialized = serializeTransactionPlan(plan);
      const stored =
        field === "version"
          ? serialized.replace('"version":2', '"version":3')
          : serialized.replace(
              '"type":"vaultV1Redeem"',
              '"type":"unknownAction"',
            );
      const restored = JSON.parse(stored, (_key, value) =>
        value && typeof value === "object" && "$bigint" in value
          ? BigInt(value.$bigint)
          : value,
      ) as TransactionPlan;
      const error =
        field === "version"
          ? UnsupportedTransactionPlanVersionError
          : UnsupportedTransactionPlanActionError;
      expect(() => parseTransactionPlan(stored)).toThrow(error);
      expect(() => getPendingSignatureRequests(restored)).toThrow(error);
      expect(() => applySignatures(restored, [])).toThrow(error);
      expect(() => buildTransaction(restored, restored.steps[0]!)).toThrow(
        error,
      );
      expect(() => buildTransactions(restored)).toThrow(error);
    },
  );

  test("validates share permits against their redeem action before signing, verifying or building", async () => {
    const handle = mockShares();
    const plan = await prepareVaultV1Redeem(handle.client, {
      ...params,
      supportSignature: true,
    });
    const request = plan.signatureRequests[0]!;
    assert(request.kind === "permit");
    const amount = params.shares - 1n;
    const tampered = {
      ...plan,
      signatureRequests: [
        {
          ...request,
          args: { ...request.args, amount },
          typedData: {
            ...request.typedData,
            message: { ...request.typedData.message, value: amount },
          },
        },
      ],
    };
    expect(() => getPendingSignatureRequests(tampered)).toThrow(
      new TransactionPlanSignatureMismatchError(request.id, "value"),
    );
    expect(() => buildTransactions(tampered)).toThrow(
      TransactionPlanSignatureMismatchError,
    );
    expect(() => applySignatures(tampered, [])).toThrow(
      TransactionPlanSignatureMismatchError,
    );
  });

  test("signs on client A, then restores and builds byte-identically without that client's state", async () => {
    const handleA = mockShares();
    const plan = await prepareVaultV1Redeem(handleA.client, {
      ...params,
      supportSignature: true,
      calldataOrigin: "0xcafe",
      referralFee: { bps: 25, recipient: IN_KIND_USER },
    });
    const signatures = await Promise.all(
      getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
        id,
        signature: await signTypedData(signerWalletClient, {
          ...typedData,
          account: signerWalletClient.account!,
        }),
      })),
    );
    const signed = applySignatures(plan, signatures);
    const expected = buildTransactions(signed);
    handleA.request.mockImplementation(async () => {
      throw new Error("Client A is unavailable");
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(signed));
    const handleB = createMockClient(mainnet);
    const permit = getVaultPermit(restored.signatureRequests, {
      id: "vaultV1Redeem:tokenPermit",
      asset: IN_KIND_VAULT,
      owner: signerAddress,
    });
    const legacy = vaultV1Redeem({
      vault: { address: IN_KIND_VAULT, chainId: mainnet.id },
      metadata: { origin: "0xcafe" },
      args: {
        shares: params.shares,
        userAddress: signerAddress,
        deadline: BigInt(params.expiresAt!),
        referralFeePct: 25n * 10n ** 14n,
        referralFeeRecipient: IN_KIND_USER,
        requirementSignature: permit,
      },
    });
    expect(buildTransactions(restored)).toEqual(expected);
    expect(expected[0]).not.toHaveProperty("id");
    expect(expected[0]).not.toHaveProperty("kind");
    expect(Object.isFrozen(expected[0])).toBe(true);
    expectTypeOf(expected[0]!.action)
      .extract<{ type: "vaultV1Redeem" }>()
      .toEqualTypeOf<VaultV1RedeemAction>();
    expect(expected[0]).toMatchObject({
      to: legacy.to,
      data: legacy.data,
      value: legacy.value,
      action: legacy.action,
    });
    expect(handleB.request).not.toHaveBeenCalled();
  });

  test.each([0n, -1n, maxUint256 + 1n])(
    "rejects an unencodable amount %s before RPC",
    async (shares) => {
      const handle = mockShares();
      await expect(
        prepareVaultV1Redeem(handle.client, { ...params, shares }),
      ).rejects.toBeInstanceOf(
        shares <= 0n ? NonPositiveInputError : InputExceedsMaxError,
      );
      expect(handle.request).not.toHaveBeenCalled();
    },
  );

  test("rejects a chain mismatch before allowance reads", async () => {
    const handle = mockShares();
    await expect(
      prepareVaultV1Redeem(handle.client, { ...params, chainId: 8453 }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("rejects legacy stored redemption amount fields", async () => {
    const plan = await prepareVaultV1Redeem(
      mockShares(maxUint256).client,
      params,
    );
    expect(() =>
      parseTransactionPlan(
        serializeTransactionPlan(plan).replace('"shares":', '"amount":'),
      ),
    ).toThrow(InvalidTransactionPlanError);
  });

  test.prop([fc.bigInt({ min: 1n, max: maxUint256 })])(
    "encodes the same exact shares as the existing handle",
    async (shares) => {
      const handle = mockShares(maxUint256);
      const plan = await prepareVaultV1Redeem(handle.client, {
        ...params,
        shares,
      });
      const legacy = vaultV1Redeem({
        vault: { address: IN_KIND_VAULT, chainId: mainnet.id },
        args: {
          shares,
          userAddress: signerAddress,
          deadline: BigInt(params.expiresAt!),
        },
      });
      expect(buildTransactions(plan)[0]).toMatchObject(legacy);
    },
  );
});
