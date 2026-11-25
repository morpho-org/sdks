import { blueAbi, erc2612Abi, metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { assert, describe, expect, expectTypeOf, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV1Data,
} from "../../../test/fixtures/inKindRedeem.js";
import {
  signerAddress,
  signerWalletClient,
} from "../../../test/helpers/signer.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { vaultV1InKindRedeem } from "../../actions/vaultV1/inKindRedeem.js";
import * as sdk from "../../index.js";
import {
  EmptyMarketParamsListError,
  InsufficientBlueBalanceForInKindRedeemError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import { getVaultPermit } from "../permit.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import { prepareVaultV1InKindRedeem } from "./inKindRedeem.js";

function setup(allowance = 0n, balance = 1000n) {
  const handle = createMockClient(mainnet);
  const blue = getChainAddress(1, "blue");
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
    result: 7n,
  });
  mockRead(handle, {
    address: IN_KIND_ASSET,
    abi: erc20Abi,
    functionName: "balanceOf",
    result: balance,
  });
  mockRead(handle, {
    address: IN_KIND_VAULT,
    abi: metaMorphoAbi,
    functionName: "MORPHO",
    result: blue,
  });
  mockRead(handle, {
    address: blue,
    abi: blueAbi,
    functionName: "feeRecipient",
    result: IN_KIND_USER,
  });
  return handle.client;
}

const params = () => ({
  chainId: 1,
  account: signerAddress,
  vault: inKindVaultV1Data(),
  assets: 100n,
  marketParamsList: [inKindMarketParams],
  expiresAt: Number(Time.timestamp()) + 7200,
});

describe("prepareVaultV1InKindRedeem", () => {
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
      const chainNow = 1_700_000_000n;
      const deviceNow = chainNow + 10_800n;
      const now = explicitNow ? chainNow : deviceNow;
      const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
      const client = setup(authorization === "sufficient" ? maxUint256 : 0n);
      const preparation = withChainTimestamp(deviceNow, () =>
        prepareVaultV1InKindRedeem(client, {
          ...params(),
          supportSignature: authorization === "permit",
          now: explicitNow ? chainNow : undefined,
          expiresAt,
        }),
      );
      if (!explicitNow && customExpiry) {
        await expect(preparation).rejects.toThrow(sdk.ExpiredDeadlineError);
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
      if (authorization === "permit")
        expect(prepared.signatureRequests[0]?.args.deadline).toBe(
          BigInt(expectedExpiry),
        );
      else
        expect(buildTransactions(prepared)).toHaveLength(
          authorization === "approval" ? 2 : 1,
        );
    },
  );
  test("exports the preparation function and params from the consumer barrel", () => {
    expect(sdk.prepareVaultV1InKindRedeem).toBe(prepareVaultV1InKindRedeem);
    expectTypeOf<sdk.VaultV1InKindRedeemPlanParams>().toEqualTypeOf<
      Parameters<typeof prepareVaultV1InKindRedeem>[1]
    >();
  });

  test("behavior: later snapshot and market-list changes do not affect the plan", async () => {
    const input = params();
    const plan = await prepareVaultV1InKindRedeem(setup(maxUint256), input);
    const before = buildTransactions(plan);
    input.marketParamsList.length = 0;
    input.vault.allocations.clear();
    expect(buildTransactions(plan)).toEqual(before);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  test.each([false, true])(
    "behavior: sufficient allowance with signatures %s",
    async (supportSignature) => {
      const plan = await prepareVaultV1InKindRedeem(setup(maxUint256), {
        ...params(),
        supportSignature,
      });
      expect(plan.steps).toHaveLength(1);
      expect(plan.signatureRequests).toEqual([]);
      expect(getPendingSignatureRequests(plan)).toEqual([]);
    },
  );

  test("default", async () => {
    const input = params();
    const client = setup();
    const plan = await prepareVaultV1InKindRedeem(client, input);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "vaultV1InKindRedeem",
    ]);
    expect(plan.steps[0]?.action.inputs).toMatchObject({
      spender: getChainAddress(1, "bundles.vaultExitBundlesV1"),
      shares: maxUint256,
    });
    expect(plan.signatureRequests).toEqual([]);
    const stable = vaultV1InKindRedeem({
      vault: { address: input.vault.address, chainId: 1 },
      args: {
        marketParamsList: input.marketParamsList,
        amount: input.assets,
        userAddress: input.account,
        deadline: BigInt(input.expiresAt),
      },
    });
    expect(buildTransactions(plan).at(-1)).toEqual(stable);
    expect(
      buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan))),
    ).toEqual(buildTransactions(plan));
  });

  test("behavior: signed plan resumes independently and matches a fresh handle", async () => {
    const input = { ...params(), supportSignature: true };
    const plan = await prepareVaultV1InKindRedeem(setup(), input);
    const [request] = getPendingSignatureRequests(plan);
    expect(request?.kind).toBe("permit");
    expect(request).toBeDefined();
    if (!request) return;
    assert(signerWalletClient.account);
    const signature = await signerWalletClient.signTypedData({
      ...request.typedData,
      account: signerWalletClient.account,
    });
    const complete = applySignatures(plan, [{ id: request.id, signature }]);
    const restored = parseTransactionPlan(serializeTransactionPlan(complete));
    expect(() =>
      parseTransactionPlan(
        serializeTransactionPlan(complete).replace('"assets":', '"amount":'),
      ),
    ).toThrow(InvalidTransactionPlanError);
    const permit = getVaultPermit(restored.signatureRequests, {
      id: request.id,
      asset: input.vault.address,
      owner: input.account,
    });
    expect(permit?.action.type).toBe("permit");
    const fresh = vaultV1InKindRedeem({
      vault: { address: input.vault.address, chainId: 1 },
      args: {
        marketParamsList: input.marketParamsList,
        amount: input.assets,
        userAddress: input.account,
        deadline: BigInt(input.expiresAt),
        requirementSignature: permit,
      },
    });
    expect(buildTransactions(restored)).toEqual([fresh]);
    expect(buildTransactions(restored)).toEqual(buildTransactions(complete));
  });

  test("error: permit deadline differs from exit deadline", async () => {
    const plan = await prepareVaultV1InKindRedeem(setup(), {
      ...params(),
      supportSignature: true,
    });
    const [request] = getPendingSignatureRequests(plan);
    assert(request);
    assert(signerWalletClient.account);
    const signature = await signerWalletClient.signTypedData({
      ...request.typedData,
      account: signerWalletClient.account,
    });
    const complete = applySignatures(plan, [{ id: request.id, signature }]);
    const restored = parseTransactionPlan(serializeTransactionPlan(complete));
    const edited = {
      ...restored,
      steps: restored.steps.map((step) =>
        step.action.type === "vaultV1InKindRedeem"
          ? {
              ...step,
              action: {
                ...step.action,
                inputs: {
                  ...step.action.inputs,
                  deadline: step.action.inputs.deadline + 1n,
                },
              },
            }
          : step,
      ),
    };
    expect(() => buildTransactions(edited)).toThrow(
      TransactionPlanSignatureMismatchError,
    );
    expect(() => buildTransactions(edited)).toThrow(
      expect.objectContaining({ field: "args.deadline" }),
    );
  });

  test.each(["request", "signature"])(
    "error: incomplete %s",
    async (missing) => {
      const plan = await prepareVaultV1InKindRedeem(setup(), {
        ...params(),
        supportSignature: true,
      });
      const incomplete = {
        ...plan,
        signatureRequests: missing === "request" ? [] : plan.signatureRequests,
      };
      expect(() => buildTransactions(incomplete)).toThrow(
        IncompleteTransactionPlanError,
      );
      try {
        buildTransactions(incomplete);
      } catch (error) {
        expect(error).toMatchObject({
          kind: "signature",
          id: "vaultV1InKindRedeem:tokenPermit",
        });
      }
    },
  );

  test("error: empty market list", async () => {
    await expect(
      prepareVaultV1InKindRedeem(setup(), {
        ...params(),
        marketParamsList: [],
      }),
    ).rejects.toBeInstanceOf(EmptyMarketParamsListError);
  });

  test("error: failed stable preflight", async () => {
    await expect(
      prepareVaultV1InKindRedeem(setup(0n, 0n), params()),
    ).rejects.toBeInstanceOf(InsufficientBlueBalanceForInKindRedeemError);
  });

  test("error: malformed serialized market", async () => {
    const plan = await prepareVaultV1InKindRedeem(setup(maxUint256), params());
    const malformed = serializeTransactionPlan(plan).replace(
      inKindMarketParams.oracle,
      "invalid",
    );
    expect(() => parseTransactionPlan(malformed)).toThrow(
      InvalidTransactionPlanError,
    );
    const valid = serializeTransactionPlan(plan).replace(
      inKindMarketParams.oracle,
      zeroAddress,
    );
    expect(() => parseTransactionPlan(valid)).not.toThrow();
  });
});
