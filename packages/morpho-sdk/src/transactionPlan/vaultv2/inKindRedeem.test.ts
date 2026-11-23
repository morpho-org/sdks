import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256, toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV2Data,
  secondInKindMarketParams,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import { getVaultPermit } from "../permit.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  buildVaultV2InKindRedeem,
  prepareVaultV2InKindRedeem,
} from "./inKindRedeem.js";

const account = privateKeyToAccount(toHex(1n, { size: 32 }));
const params = () => ({
  vault: inKindVaultV2Data({ additionalMarket: true }),
  marketParamsList: [secondInKindMarketParams, inKindMarketParams],
  assets: 500n,
  chainId: mainnet.id,
  account: account.address,
  expiresAt: Number(Time.timestamp() + 7200n),
});
const mockClient = (allowance = 0n) => {
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
    result: 9n,
  });
  mockRead(handle, {
    address: IN_KIND_ASSET,
    abi: erc20Abi,
    functionName: "balanceOf",
    result: 10_000n,
  });
  return handle;
};

describe("prepareVaultV2InKindRedeem", () => {
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
    "uses reference time with explicitNow=$explicitNow, customExpiry=$customExpiry and $authorization",
    async ({ explicitNow, customExpiry, authorization }) => {
      const input = params();
      const chainNow = input.vault.lastUpdate;
      const deviceNow = chainNow + 10_800n;
      const now = explicitNow ? chainNow : deviceNow;
      const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
      const mock = mockClient(authorization === "sufficient" ? maxUint256 : 0n);
      const preparation = withChainTimestamp(deviceNow, () =>
        prepareVaultV2InKindRedeem(mock.client, {
          ...input,
          supportSignature: authorization === "permit",
          now: explicitNow ? chainNow : undefined,
          expiresAt,
        }),
      );
      if (!explicitNow && customExpiry) {
        await expect(preparation).rejects.toThrow(ExpiredDeadlineError);
        expect(mock.request).not.toHaveBeenCalled();
        return;
      }
      const prepared = await preparation;
      const expectedExpiry = expiresAt ?? Number(now + 7_200n);
      expect(prepared.expiresAt).toBe(expectedExpiry);
      expect(prepared.steps.at(-1)?.action.inputs).toMatchObject({
        deadline: BigInt(expectedExpiry),
      });
      expect(prepared.signatureRequests).toHaveLength(
        authorization === "permit" ? 1 : 0,
      );
      if (authorization === "permit") {
        expect(prepared.signatureRequests[0]?.args.deadline).toBe(
          BigInt(expectedExpiry),
        );
      } else {
        expect(buildTransactions(prepared)).toHaveLength(
          authorization === "approval" ? 2 : 1,
        );
      }
    },
  );
  test.each([false, true])(
    "behavior: ordered routing and cross-client restoration, permit %s",
    async (supportSignature) => {
      const input = {
        ...params(),
        supportSignature,
        calldataOrigin: "0xcafe" as const,
      };
      const first = mockClient();
      const plan = await prepareVaultV2InKindRedeem(first.client, input);
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        supportSignature
          ? ["vaultV2InKindRedeem"]
          : ["erc20Approval", "vaultV2InKindRedeem"],
      );
      if (!supportSignature) {
        expect(plan.steps[0]?.action.inputs).toMatchObject({
          spender: getChainAddress(1, "bundles.vaultExitBundlesV1"),
          shares: maxUint256,
        });
      }
      const pending = parseTransactionPlan(serializeTransactionPlan(plan));
      expect(() =>
        parseTransactionPlan(
          serializeTransactionPlan(plan).replace('"assets":', '"amount":'),
        ),
      ).toThrow(InvalidTransactionPlanError);
      const updates = await Promise.all(
        getPendingSignatureRequests(pending).map(async ({ id, typedData }) => ({
          id,
          signature: await account.signTypedData(typedData),
        })),
      );
      const signed = applySignatures(pending, updates);
      const restored = parseTransactionPlan(serializeTransactionPlan(signed));
      first.request.mockClear();
      const transactions = buildTransactions(restored);
      expect(transactions).toEqual(buildTransactions(signed));
      expect(first.request).not.toHaveBeenCalled();
      const second = mockClient();
      const handle = morphoViemExtension({
        supportSignature,
        metadata: { origin: input.calldataOrigin },
      })(second.client)
        .morpho.vaultV2(input.vault.address, input.chainId)
        .inKindRedeem({
          ...input,
          vaultData: input.vault,
          amount: input.assets,
          userAddress: input.account,
          deadline: BigInt(input.expiresAt),
        });
      const permit = getVaultPermit(restored.signatureRequests, {
        id: supportSignature ? "vaultV2InKindRedeem:tokenPermit" : undefined,
        asset: input.vault.address,
        owner: input.account,
      });
      const signatures = permit ? [permit] : [];
      expect(transactions.at(-1)?.data).toBe(handle.buildTx(signatures).data);
      expect(Object.isFrozen(transactions.at(-1))).toBe(true);
    },
  );

  test("behavior: sufficient finite allowance needs no approval or signature", async () => {
    const plan = await prepareVaultV2InKindRedeem(mockClient(10_000n).client, {
      ...params(),
      supportSignature: true,
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.signatureRequests).toEqual([]);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  test("behavior: idle-only exit keeps an empty market list", async () => {
    const plan = await prepareVaultV2InKindRedeem(mockClient().client, {
      ...params(),
      vault: inKindVaultV2Data({ assetBalance: 1000n }),
      marketParamsList: [],
    });
    expect(
      buildTransactions(
        parseTransactionPlan(serializeTransactionPlan(plan)),
      ).at(-1)?.action.args,
    ).toMatchObject({ marketParamsList: [] });
  });

  test.each([0n, -1n])(
    "error: NonPositiveInputError, amount %s",
    async (amount) => {
      const handle = mockClient();
      await expect(
        prepareVaultV2InKindRedeem(handle.client, {
          ...params(),
          assets: amount,
        }),
      ).rejects.toBeInstanceOf(NonPositiveInputError);
      expect(handle.request).not.toHaveBeenCalled();
    },
  );

  test("error: insufficient coverage fails before reads", async () => {
    const handle = mockClient();
    await expect(
      prepareVaultV2InKindRedeem(handle.client, {
        ...params(),
        assets: 100_000n,
      }),
    ).rejects.toBeInstanceOf(InKindRedeemCoverageError);
    expect(handle.request).not.toHaveBeenCalled();
  });
});

describe("buildVaultV2InKindRedeem", () => {
  test.each([false, true])(
    "error: IncompleteTransactionPlanError, missing request %s",
    async (missing) => {
      const plan = await prepareVaultV2InKindRedeem(mockClient().client, {
        ...params(),
        supportSignature: true,
      });
      const step = plan.steps[0]!;
      assert(step.action.type === "vaultV2InKindRedeem");
      const requests = missing ? [] : plan.signatureRequests;
      const action = step.action;
      for (const build of [
        () => buildVaultV2InKindRedeem(action, requests),
        () => buildTransaction({ ...plan, signatureRequests: requests }, step),
      ]) {
        expect(build).toThrow(IncompleteTransactionPlanError);
        expect(build).toThrow(
          expect.objectContaining({
            kind: "signature",
            id: "vaultV2InKindRedeem:tokenPermit",
          }),
        );
      }
    },
  );

  test("error: stored routing inputs are shape-checked", async () => {
    const plan = await prepareVaultV2InKindRedeem(
      mockClient(maxUint256).client,
      params(),
    );
    const broken = {
      ...plan,
      steps: plan.steps.map((step) => ({
        ...step,
        action: {
          ...step.action,
          inputs: {
            ...step.action.inputs,
            marketParamsList: [{ loanToken: zeroAddress }],
          },
        },
      })),
    };
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(broken as typeof plan)),
    ).toThrow(InvalidTransactionPlanError);
  });

  test("error: permits must target the exit periphery and remain unlimited", async () => {
    const plan = await prepareVaultV2InKindRedeem(mockClient().client, {
      ...params(),
      supportSignature: true,
    });
    for (const args of [
      { spender: getChainAddress(1, "bundles.vaultBundlesV1") },
      { amount: 1n },
    ]) {
      const changed = {
        ...plan,
        signatureRequests: plan.signatureRequests.map((request) => {
          assert(request.kind === "permit");
          return { ...request, args: { ...request.args, ...args } };
        }),
      };
      expect(() => getPendingSignatureRequests(changed)).toThrow(
        TransactionPlanSignatureMismatchError,
      );
      expect(() => buildTransactions(changed)).toThrow(
        TransactionPlanSignatureMismatchError,
      );
    }
  });
});
