import {
  AccrualPosition,
  addressesRegistry,
  Market,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { decodeFunctionData, toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  InputExceedsMaxError,
  NegativeInputError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import { prepareBlueBorrow } from "./borrow.js";
import { prepareBlueRefinance } from "./refinance.js";
import { prepareBlueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";
import { prepareBlueWithdraw } from "./withdraw.js";

const account = privateKeyToAccount(toHex(1n, { size: 32 })).address;
const kinds = [
  "borrow",
  "supplyCollateralBorrow",
  "withdraw",
  "refinance",
] as const;

function snapshot(lltv: bigint) {
  const market = new Market({
    params: new MarketParams({
      loanToken: addressesRegistry[1].usdc,
      collateralToken: addressesRegistry[1].wNative,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv,
    }),
    totalSupplyAssets: 10_000n,
    totalSupplyShares: 10_000_000_000n,
    totalBorrowAssets: 100n,
    totalBorrowShares: 100_000_000n,
    lastUpdate: 100n,
    fee: 0n,
    price: 10n ** 36n,
  });
  return {
    marketId: market.id,
    marketData: { chainId: 1, market },
    positionData: {
      chainId: 1,
      position: new AccrualPosition(
        {
          user: account,
          supplyShares: 1_000_000_000n,
          borrowShares: 10_000_000n,
          collateral: 10_000n,
        },
        market,
      ),
    },
  };
}

const reallocation = (penalty: bigint): VaultV2BlueReallocation => ({
  vault: account,
  from: { type: "idle" },
  to: { adapter: account },
  assets: 100n,
  penalty,
});

function prepare(
  kind: (typeof kinds)[number],
  {
    reallocations,
    maxPenalty,
  }: {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly maxPenalty?: bigint;
  },
) {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: addressesRegistry[1].blue,
    abi: blueAbi,
    functionName: "isAuthorized",
    result: true,
  });
  const common = {
    chainId: 1,
    account,
    now: 100n,
    expiresAt: 200,
    reallocations,
    maxPenalty,
  };
  const destination = snapshot(800_000000000000000n);
  switch (kind) {
    case "borrow":
      return prepareBlueBorrow(handle.client, {
        ...common,
        ...destination,
        borrowAssets: 100n,
      });
    case "supplyCollateralBorrow":
      return prepareBlueSupplyCollateralBorrow(handle.client, {
        ...common,
        ...destination,
        collateralAssets: 0n,
        borrowAssets: 100n,
      });
    case "withdraw":
      return prepareBlueWithdraw(handle.client, {
        ...common,
        ...destination,
        assets: 100n,
      });
    case "refinance":
      return prepareBlueRefinance(handle.client, {
        ...common,
        source: snapshot(900_000000000000000n),
        destination,
      });
  }
}

describe.each(kinds)(
  "TransactionPlan %s reallocation penalty bounds",
  (kind) => {
    const preparePlan = (
      reallocations: readonly VaultV2BlueReallocation[],
      maxPenalty?: bigint,
    ) => prepare(kind, { reallocations, maxPenalty });
    test("rejects positive penalties by default", async () => {
      const pending = preparePlan([reallocation(1n)]);
      await expect(pending).rejects.toBeInstanceOf(InputExceedsMaxError);
      await expect(pending).rejects.toMatchObject({
        field: "reallocation.penalty",
        value: 1n,
        max: 0n,
      });
    });

    test.each([1n, MathLib.WAD])(
      "accepts and encodes the exact bound %s after serialization",
      async (penalty) => {
        const plan = await preparePlan([reallocation(penalty)], penalty);
        expect(plan.steps.at(-1)?.action.inputs).toHaveProperty(
          "maxPenalty",
          penalty,
        );
        const restored = parseTransactionPlan(serializeTransactionPlan(plan));
        expect(restored).toEqual(plan);
        const transactions = buildTransactions(restored);
        expect(transactions).toEqual(buildTransactions(plan));
        expect(transactions).toHaveLength(1);
        const transaction = transactions[0];
        assert(transaction);
        const decoded = decodeFunctionData({
          abi: blueBundlesV1Abi,
          data: transaction.data,
        });
        expect(decoded.args).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([expect.objectContaining({ penalty })]),
          ]),
        );
      },
    );

    test("rejects penalties above an explicit bound", async () => {
      const pending = preparePlan([reallocation(2n)], 1n);
      await expect(pending).rejects.toBeInstanceOf(InputExceedsMaxError);
      await expect(pending).rejects.toMatchObject({
        field: "reallocation.penalty",
        value: 2n,
        max: 1n,
      });
    });

    test("enforces a lowered or omitted stored bound when rebuilding", async () => {
      const plan = await preparePlan([reallocation(2n)], 2n);
      for (const maxPenalty of [undefined, 1n]) {
        const changed = structuredClone(plan);
        const step = changed.steps[0];
        assert(step);
        Object.assign(step.action.inputs, { maxPenalty });
        const restored = parseTransactionPlan(
          serializeTransactionPlan(changed),
        );
        expect(() => buildTransactions(restored)).toThrow(InputExceedsMaxError);
        expect(() => buildTransactions(restored)).toThrow(
          expect.objectContaining({
            field: "reallocation.penalty",
            max: maxPenalty ?? 0n,
          }),
        );
      }
    });

    test("rejects malformed stored maxPenalty", async () => {
      const plan = structuredClone(await preparePlan([], 0n));
      const step = plan.steps[0];
      assert(step);
      Object.assign(step.action.inputs, { maxPenalty: "1" });
      expect(() =>
        parseTransactionPlan(serializeTransactionPlan(plan)),
      ).toThrow(InvalidTransactionPlanError);
    });

    test.each([
      { maxPenalty: -1n, ErrorClass: NegativeInputError },
      { maxPenalty: MathLib.WAD + 1n, ErrorClass: InputExceedsMaxError },
    ])(
      "validates maxPenalty without reallocations ($maxPenalty)",
      async ({ maxPenalty, ErrorClass }) => {
        await expect(preparePlan([], maxPenalty)).rejects.toBeInstanceOf(
          ErrorClass,
        );
      },
    );

    test.each([{ reallocations: [] }, { reallocations: [reallocation(0n)] }])(
      "accepts empty or zero-penalty reallocations by default: $reallocations",
      async ({ reallocations }) => {
        const plan = await preparePlan(reallocations);
        expect(
          buildTransactions(
            parseTransactionPlan(serializeTransactionPlan(plan)),
          ),
        ).toHaveLength(1);
      },
    );
  },
);
