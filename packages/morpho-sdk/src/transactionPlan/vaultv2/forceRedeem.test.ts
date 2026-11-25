import { MarketParams } from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, expectTypeOf, test } from "vitest";
import { IN_KIND_USER } from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { vaultV2ForceRedeem } from "../../actions/vaultV2/forceRedeem.js";
import {
  EmptyDeallocationsError,
  ExpiredDeadlineError,
  NonPositiveInputError,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  buildVaultV2ForceRedeem,
  prepareVaultV2ForceRedeem,
  type VaultV2ForceRedeemPlanParams,
  validateForceRedeemPlanAction,
} from "./forceRedeem.js";

const params = {
  vaultAddress: zeroAddress,
  chainId: 1,
  account: IN_KIND_USER,
  shares: 100n,
  deallocations: [
    {
      adapter: zeroAddress,
      assets: 60n,
      marketParams: new MarketParams({
        loanToken: zeroAddress,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      }),
    },
    { adapter: zeroAddress, assets: 40n },
  ],
};

describe("Vault V2 force-redeem plan", () => {
  test.each([
    { explicitNow: true, customExpiry: false },
    { explicitNow: true, customExpiry: true },
    { explicitNow: false, customExpiry: false },
    { explicitNow: false, customExpiry: true },
  ])(
    "uses reference time with explicitNow=$explicitNow and customExpiry=$customExpiry",
    async ({ explicitNow, customExpiry }) => {
      const chainNow = 1_700_000_000n;
      const deviceNow = chainNow + 10_800n;
      const now = explicitNow ? chainNow : deviceNow;
      const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
      const mock = createMockClient(mainnet);
      const preparation = withChainTimestamp(deviceNow, () =>
        prepareVaultV2ForceRedeem(mock.client, {
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
      expect(plan.expiresAt).toBe(expiresAt ?? Number(now + 7_200n));
      expect(plan.signatureRequests).toEqual([]);
      expect(buildTransactions(plan)).toHaveLength(1);
    },
  );
  test("does not accept signature or deployless options", () => {
    expectTypeOf<VaultV2ForceRedeemPlanParams>().not.toHaveProperty(
      "supportSignature",
    );
    expectTypeOf<VaultV2ForceRedeemPlanParams>().not.toHaveProperty(
      "deployless",
    );
  });
  test("deallocations use asset-denominated fields", () => {
    expectTypeOf<
      VaultV2ForceRedeemPlanParams["deallocations"][number]
    >().toHaveProperty("assets");
    expectTypeOf<
      VaultV2ForceRedeemPlanParams["deallocations"][number]
    >().not.toHaveProperty("amount");
  });
  test("preparing and building preserve cached market params without freezing them", async () => {
    const cached = new MarketParams({
      ...params.deallocations[0]!.marketParams!,
      lltv: 1n,
    });
    const plan = await prepareVaultV2ForceRedeem(
      createMockClient(mainnet).client,
      {
        ...params,
        deallocations: [
          { adapter: zeroAddress, assets: 100n, marketParams: cached },
        ],
      },
    );
    expect(MarketParams.get(cached.id)).toBe(cached);
    expect(Object.isFrozen(cached)).toBe(false);

    for (const saved of [
      plan,
      parseTransactionPlan(serializeTransactionPlan(plan)),
    ]) {
      const action = saved.steps[0]!.action;
      if (action.type !== "vaultV2ForceRedeem")
        throw new Error("Expected force-redeem action");
      const built = buildVaultV2ForceRedeem(action);
      const market = built.action.args.deallocations[0]!.marketParams!;
      expect(Object.getPrototypeOf(market)).toBe(Object.prototype);
      expect(Object.isFrozen(market)).toBe(true);
      expect(market.id).toBe(cached.id);
      expect(MarketParams.get(cached.id)).toBe(cached);
      expect(Object.isFrozen(cached)).toBe(false);
    }
  });

  test("round-trips without requests and builds independently of the preparing client", async () => {
    const a = createMockClient(mainnet);
    const b = createMockClient(mainnet);
    const plan = await prepareVaultV2ForceRedeem(a.client, {
      ...params,
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps[0]?.action).not.toHaveProperty("signatureRequestIds");
    expect(plan).not.toHaveProperty("fetchRequests");
    expect(getPendingSignatureRequests(plan)).toEqual([]);
    expect(applySignatures(plan, [])).toEqual(plan);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(() =>
      parseTransactionPlan(
        serializeTransactionPlan(plan).replaceAll('"assets":', '"amount":'),
      ),
    ).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.inputs.deallocations[0].assets",
      }),
    );
    const [built] = buildTransactions(restored);
    expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
    const expected = vaultV2ForceRedeem({
      vault: { address: params.vaultAddress },
      args: {
        deallocations: params.deallocations.map(
          ({ assets, marketParams, ...deallocation }) => ({
            ...deallocation,
            ...(marketParams && {
              marketParams: new MarketParams(marketParams),
            }),
            amount: assets,
          }),
        ),
        redeem: { shares: params.shares, recipient: params.account },
        onBehalf: params.account,
      },
    });
    expectTypeOf(
      expected.action.args.deallocations[0]!.marketParams,
    ).toEqualTypeOf<MarketParams | undefined>();
    expect(expected.action.args.deallocations[0]?.marketParams?.id).toBe(
      params.deallocations[0]!.marketParams!.id,
    );
    expect(built).toMatchObject({
      to: expected.to,
      data: expected.data,
      value: expected.value,
    });
    expect(Object.keys(built!).sort()).toEqual([
      "action",
      "data",
      "to",
      "value",
    ]);
    const step = restored.steps[0]!;
    expect(buildTransaction(restored, step)).toEqual(built);
    if (step.action.type !== "vaultV2ForceRedeem")
      throw new Error("Expected force-redeem action");
    expect(step.action.inputs.deallocations).toEqual([
      {
        adapter: zeroAddress,
        assets: 60n,
        marketParams: {
          loanToken: zeroAddress,
          collateralToken: zeroAddress,
          oracle: zeroAddress,
          irm: zeroAddress,
          lltv: 0n,
        },
      },
      { adapter: zeroAddress, assets: 40n },
    ]);
    expect(buildVaultV2ForceRedeem(step.action)).toEqual(built);
    expect(() =>
      buildTransactions({ ...restored, chainId: 999, account: zeroAddress }),
    ).toThrow(InvalidTransactionPlanError);
    expect(b.request).not.toHaveBeenCalled();
  });

  test.each([
    { vault: "not-an-address" },
    { redeem: { shares: "100" } },
    { deallocations: null },
    { deallocations: [{ adapter: zeroAddress, amount: 1n }] },
    { deallocations: [{ adapter: zeroAddress, assets: "1" }] },
    { deallocations: [{ adapter: zeroAddress, assets: -1n }] },
    { deallocations: [{ adapter: "invalid", assets: 1n }] },
    { deallocations: [{ adapter: zeroAddress, assets: 1n, marketParams: {} }] },
  ])("rejects malformed stored force-redeem fields: %#", (inputs) => {
    expect(() =>
      validateForceRedeemPlanAction(
        {
          inputs: {
            ...params,
            vault: params.vaultAddress,
            redeem: { shares: params.shares },
            ...inputs,
          },
        },
        "$.steps[0].action",
      ),
    ).toThrow(InvalidTransactionPlanError);
  });

  test("accepts an empty stored deallocation list without business validation", () => {
    expect(() =>
      validateForceRedeemPlanAction(
        {
          inputs: {
            ...params,
            vault: params.vaultAddress,
            redeem: { shares: params.shares },
            deallocations: [],
          },
        },
        "$.steps[0].action",
      ),
    ).not.toThrow();
  });

  test("snapshots caller inputs without freezing or retaining them", async () => {
    const client = createMockClient(mainnet).client;
    const deallocations = [{ adapter: zeroAddress, assets: 100n }];
    const mutableParams = {
      ...params,
      deallocations,
    };
    const plan = await prepareVaultV2ForceRedeem(client, mutableParams);
    const before = buildTransactions(plan);
    mutableParams.shares = 1n;
    deallocations[0]!.assets = 1n;
    expect(buildTransactions(plan)).toEqual(before);
    expect(Object.isFrozen(plan.steps[0]?.action.inputs)).toBe(true);
  });

  test("rejects empty deallocations and nonpositive shares or assets during preparation", async () => {
    const client = createMockClient(mainnet).client;
    await expect(
      prepareVaultV2ForceRedeem(client, {
        ...params,
        deallocations: [],
      }),
    ).rejects.toThrow(EmptyDeallocationsError);
    await expect(
      prepareVaultV2ForceRedeem(client, {
        ...params,
        shares: 0n,
      }),
    ).rejects.toThrow(NonPositiveInputError);
    await expect(
      prepareVaultV2ForceRedeem(client, {
        ...params,
        deallocations: [{ adapter: zeroAddress, assets: 0n }],
      }),
    ).rejects.toThrow(NonPositiveInputError);
    await expect(
      prepareVaultV2ForceRedeem(client, {
        ...params,
        deallocations: [{ adapter: zeroAddress, assets: -1n }],
      }),
    ).rejects.toThrow(NonPositiveInputError);
  });
});
