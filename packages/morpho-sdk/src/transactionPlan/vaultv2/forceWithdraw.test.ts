import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256, serializeSignature, toHex } from "viem";
import { mainnet } from "viem/chains";
import { assert, expect, expectTypeOf, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { computeVaultV2ForceWithdrawQuote } from "../../entities/vaultV2/forceWithdrawQuote.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import * as sdk from "../../index.js";

test("exports prepareVaultV2ForceWithdraw", () => {
  expect(sdk).toHaveProperty("prepareVaultV2ForceWithdraw");
  expectTypeOf<sdk.VaultV2ForceWithdrawPlanParams>().not.toHaveProperty(
    "amount",
  );
  expectTypeOf<sdk.VaultV2ForceWithdrawPlanParams>().not.toHaveProperty(
    "minSharePriceE27",
  );
});

test.each(
  [true, false].flatMap((explicitNow) =>
    [true, false].flatMap((customExpiry) =>
      ["sufficient", "approval", "permit"].map((authorization) => ({
        explicitNow,
        customExpiry,
        authorization,
      })),
    ),
  ),
)(
  "force withdrawal uses reference time with explicitNow=$explicitNow, customExpiry=$customExpiry and $authorization",
  async ({ explicitNow, customExpiry, authorization }) => {
    const vault = inKindVaultV2Data();
    const chainNow = vault.lastUpdate;
    const deviceNow = chainNow + 10_800n;
    const now = explicitNow ? chainNow : deviceNow;
    const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
    const mock = createMockClient(mainnet);
    mockRead(mock, {
      address: vault.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: authorization === "sufficient" ? maxUint256 : 0n,
    });
    mockRead(mock, {
      address: vault.address,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 0n,
    });
    const preparation = withChainTimestamp(deviceNow, () =>
      sdk.prepareVaultV2ForceWithdraw(mock.client, {
        vault,
        chainId: 1,
        account: IN_KIND_USER,
        assets: 51n,
        supportSignature: authorization === "permit",
        now: explicitNow ? chainNow : undefined,
        expiresAt,
      }),
    );
    if (!explicitNow && customExpiry) {
      await expect(preparation).rejects.toThrow(sdk.ExpiredDeadlineError);
      expect(mock.request).not.toHaveBeenCalled();
      return;
    }
    const plan = await preparation;
    const expectedExpiry = expiresAt ?? Number(now + 7_200n);
    expect(plan.expiresAt).toBe(expectedExpiry);
    expect(plan.steps.at(-1)?.action.inputs).toMatchObject({
      deadline: BigInt(expectedExpiry),
    });
    expect(plan.signatureRequests).toHaveLength(
      authorization === "permit" ? 1 : 0,
    );
    if (authorization === "permit") {
      expect(plan.signatureRequests[0]?.args.deadline).toBe(
        BigInt(expectedExpiry),
      );
    } else {
      expect(sdk.buildTransactions(plan)).toHaveLength(
        authorization === "approval" ? 2 : 1,
      );
    }
  },
);

test.each(
  [0n, maxUint256].flatMap((allowance) =>
    [undefined, 0n, MAX_SLIPPAGE_TOLERANCE].map((slippageTolerance) => ({
      allowance,
      slippageTolerance,
    })),
  ),
)(
  "prepares and restores an approval-funded exit with allowance $allowance and tolerance $slippageTolerance",
  async ({ allowance, slippageTolerance }) => {
    const mock = createMockClient(mainnet);
    mockRead(mock, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: allowance,
    });
    mockRead(mock, {
      address: IN_KIND_VAULT,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 0n,
    });
    const vaultData = inKindVaultV2Data({ penalty: 20_000_000_000_000_000n });
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const plan = await sdk.prepareVaultV2ForceWithdraw(mock.client, {
      chainId: 1,
      account: IN_KIND_USER,
      assets: 51n,
      vault: vaultData,
      expiresAt,
      slippageTolerance,
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan).not.toHaveProperty("fetchRequests");
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      allowance === 0n
        ? ["erc20Approval", "vaultV2ForceWithdraw"]
        : ["vaultV2ForceWithdraw"],
    );
    const restored = sdk.parseTransactionPlan(
      sdk.serializeTransactionPlan(plan),
    );
    if (allowance === 0n) {
      expect(restored.steps[0]?.action.inputs).toMatchObject({
        shares: maxUint256,
      });
    }
    expect(sdk.buildTransactions(restored)).toEqual(
      sdk.buildTransactions(plan),
    );
    const quote = computeVaultV2ForceWithdrawQuote({
      exitAssets: 51n,
      userAddress: IN_KIND_USER,
      vaultData,
      deadline: BigInt(expiresAt),
      slippageTolerance,
      now: Time.timestamp(),
      vault: IN_KIND_VAULT,
    });
    const expected = sdk.vaultV2ForceWithdraw({
      vault: { address: IN_KIND_VAULT, chainId: 1 },
      args: {
        exitAssets: 51n,
        userAddress: IN_KIND_USER,
        adapter: quote.adapter,
        minSharePriceE27: quote.minSharePriceE27,
        deadline: BigInt(expiresAt),
      },
    });
    expect(sdk.buildTransactions(restored).at(-1)).toMatchObject(expected);
    const step = restored.steps.at(-1)!;
    expect(() =>
      sdk.buildTransaction(
        { ...restored, chainId: 8453, account: IN_KIND_VAULT },
        step,
      ),
    ).toThrow(sdk.InvalidTransactionPlanError);
    const transaction = sdk.buildTransaction(restored, step);
    expect(transaction).toEqual(expected);
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(transaction).not.toHaveProperty("id");
    expect(transaction).not.toHaveProperty("kind");
    if (step.action.type !== "vaultV2ForceWithdraw") {
      throw new Error("Expected a force-withdraw step");
    }
    expect(step.action.inputs.assets).toBe(51n);
    expect(step.action.inputs.minSharePriceE27).toBe(
      expected.action.args.minSharePriceE27,
    );
    expect(step.action.inputs).not.toHaveProperty("exitAssets");
    expect(step.action.inputs).not.toHaveProperty("slippageTolerance");
    const legacy = sdk
      .serializeTransactionPlan({ ...restored, steps: [step] })
      .replace('"assets":', '"exitAssets":');
    expect(() => sdk.parseTransactionPlan(legacy)).toThrow(
      sdk.InvalidTransactionPlanError,
    );
    for (const minSharePriceE27 of [0n, -1n]) {
      const invalidStep = {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, minSharePriceE27 },
        },
      };
      const invalidPlan = { ...restored, steps: [invalidStep] };
      const error = new sdk.NonPositiveInputError(
        "minSharePriceE27",
        minSharePriceE27,
      );
      expect(() => sdk.buildTransaction(invalidPlan, invalidStep)).toThrow(
        error,
      );
      expect(() => sdk.buildTransactions(invalidPlan)).toThrow(error);
      expect(() =>
        sdk.parseTransactionPlan(sdk.serializeTransactionPlan(invalidPlan)),
      ).toThrow(
        expect.objectContaining({
          name: "InvalidTransactionPlanError",
          path: "$.steps[0].action.inputs.minSharePriceE27",
        }),
      );
    }
  },
);

test.each([
  { assets: 0n, error: sdk.NonPositiveInputError },
  { assets: -1n, error: sdk.NonPositiveInputError },
  { assets: maxUint256 + 1n, error: sdk.InputExceedsMaxError },
  { assets: 51n, slippageTolerance: -1n, error: sdk.NegativeInputError },
  {
    assets: 51n,
    slippageTolerance: MAX_SLIPPAGE_TOLERANCE + 1n,
    error: sdk.ExcessiveSlippageToleranceError,
  },
])(
  "rejects invalid forced-exit assets or tolerance before RPC: %s",
  async ({ error, ...quantity }) => {
    const mock = createMockClient(mainnet);
    await expect(
      sdk.prepareVaultV2ForceWithdraw(mock.client, {
        chainId: 1,
        account: IN_KIND_USER,
        vault: inKindVaultV2Data(),
        ...quantity,
      }),
    ).rejects.toBeInstanceOf(error);
    expect(mock.request).not.toHaveBeenCalled();
  },
);

test.each([true, false])(
  "reports a missing permit dependency (request present: %s)",
  async (present) => {
    const mock = createMockClient(mainnet);
    mockRead(mock, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(mock, {
      address: IN_KIND_VAULT,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 0n,
    });
    const plan = await sdk.prepareVaultV2ForceWithdraw(mock.client, {
      chainId: 1,
      account: IN_KIND_USER,
      assets: 51n,
      vault: inKindVaultV2Data(),
      supportSignature: true,
    });
    expect(plan.signatureRequests).toHaveLength(1);
    const request = plan.signatureRequests[0]!;
    assert(request.kind === "permit");
    expect(request.args.amount).toBe(maxUint256);
    expect(request.typedData.message.value).toBe(maxUint256);
    expect(sdk.getPendingSignatureRequests(plan)).toEqual([request]);
    expect(sdk.applySignatures(plan, []).steps).toEqual(plan.steps);
    const deadline = request.args.deadline - 1n;
    const mismatched = {
      ...plan,
      signatureRequests: [
        {
          ...request,
          args: { ...request.args, deadline },
          typedData: {
            ...request.typedData,
            message: { ...request.typedData.message, deadline },
          },
          signature: serializeSignature({
            r: toHex(1n, { size: 32 }),
            s: toHex(2n, { size: 32 }),
            yParity: 0,
          }),
        },
      ],
    };
    expect(() => sdk.buildTransactions(mismatched)).toThrow(
      sdk.InvalidTransactionPlanError,
    );
    const altered = {
      ...plan,
      signatureRequests: [
        { ...request, args: { ...request.args, spender: IN_KIND_USER } },
      ],
    };
    expect(() => sdk.getPendingSignatureRequests(altered)).toThrow(
      sdk.TransactionPlanSignatureMismatchError,
    );
    expect(() => sdk.applySignatures(altered, [])).toThrow(
      sdk.TransactionPlanSignatureMismatchError,
    );
    const finite = {
      ...plan,
      signatureRequests: [
        {
          ...request,
          args: { ...request.args, amount: 1n },
          typedData: {
            ...request.typedData,
            message: { ...request.typedData.message, value: 1n },
          },
        },
      ],
    };
    expect(() => sdk.getPendingSignatureRequests(finite)).toThrow(
      expect.objectContaining({ id: request.id, field: "value" }),
    );
    expect(() =>
      sdk.buildTransactions({
        ...plan,
        signatureRequests: present ? plan.signatureRequests : [],
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "IncompleteTransactionPlanError",
        id: "vaultV2ForceWithdraw:tokenPermit",
      }),
    );
  },
);
