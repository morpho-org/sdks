import { fc, test as propTest } from "@fast-check/vitest";
import { MathLib } from "@morpho-org/blue-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../test/fixtures/inKindRedeem.js";
import { morphoViemExtension } from "./client/index.js";
import { computeVaultMaxSharePrice } from "./helpers/slippage.js";
import {
  InputExceedsMaxError,
  InvalidBigIntInputError,
} from "./types/index.js";

const window = 604_800n;
const target = "0x0000000000000000000000000000000000001012";

function setup(clock?: unknown) {
  const mock = createMockClient(mainnet);
  const client = mock.client.extend(morphoViemExtension());
  const v1 = inKindVaultV1Data();
  const v2 = inKindVaultV2Data({
    address: target,
    totalAssets: 1_000_000_000n,
    assetBalance: 2_000_000_000n,
    maxRate: MathLib.WAD / 31_536_000n,
  });
  const now = v2.lastUpdate;
  for (const address of [v1.asset, IN_KIND_VAULT]) {
    mockRead(mock, {
      address,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
  }
  const entityV1 = client.morpho.vaultV1(IN_KIND_VAULT, 1);
  const entityV2 = client.morpho.vaultV2(target, 1);
  const common = {
    now: (clock ?? now) as bigint,
    userAddress: IN_KIND_USER,
  };
  return {
    now,
    v1,
    v2,
    paths: [
      (deadline?: bigint) =>
        entityV1.deposit({ ...common, amount: 100n, vaultData: v1, deadline }),
      (deadline?: bigint) =>
        entityV2.deposit({ ...common, amount: 100n, vaultData: v2, deadline }),
      (deadline?: bigint) =>
        entityV1.migrateToV2({
          ...common,
          assets: 100n,
          sourceVault: v1,
          targetVault: v2,
          deadline,
        }),
    ],
  };
}

test.each([0, 1, 2])(
  "[INV-04] entity path %s accepts exactly seven days and rejects one second more",
  async (index) => {
    const { now, paths } = setup();
    await expect(
      Promise.resolve().then<unknown>(() => paths[index]!(now + window)),
    ).resolves.toBeDefined();
    const rejected = Promise.resolve().then<unknown>(() =>
      paths[index]!(now + window + 1n),
    );
    await expect(rejected).rejects.toBeInstanceOf(InputExceedsMaxError);
    await expect(rejected).rejects.toMatchObject({ field: "deadline" });
  },
);

propTest.prop(
  [
    fc.bigInt({ min: 1n, max: window }),
    fc.bigInt({ min: 0n, max: MathLib.WAD / 10n }),
  ],
  { numRuns: 1000 },
)(
  "bounded deadline accrual stays below the rounded seven-day price envelope",
  (elapsed, slippageTolerance) => {
    const { now, v1, v2 } = setup();
    for (const vaultData of [v1, v2]) {
      const assets = 100_000_000n;
      const actual = computeVaultMaxSharePrice({
        vaultData,
        deadline: now + elapsed,
        assets,
        slippageTolerance,
      });
      const bound = computeVaultMaxSharePrice({
        vaultData,
        deadline: now + window,
        assets,
        slippageTolerance,
      });
      expect(actual).toBeLessThanOrEqual(bound);
    }
    // Upper-bound assets with the protocol's linear maxRate cap; fee shares can only lower price.
    // Include ERC-4626 virtual assets/shares and deposit rounding rather than a real-number ratio.
    const assets = 100_000_000n;
    const cappedAssets =
      v2._totalAssets + MathLib.wMulDown(v2._totalAssets * window, v2.maxRate);
    const minShares = MathLib.mulDivDown(
      assets,
      v2.totalSupply + v2.virtualShares,
      cappedAssets + 1n,
    );
    const rateBound = MathLib.mulDivUp(
      assets,
      MathLib.wToRay(MathLib.WAD + slippageTolerance),
      minShares,
    );
    const snapshotPrice = computeVaultMaxSharePrice({
      vaultData: v2,
      deadline: now,
      assets,
      slippageTolerance,
    });
    const deadlinePrice = computeVaultMaxSharePrice({
      vaultData: v2,
      deadline: now + elapsed,
      assets,
      slippageTolerance,
    });
    expect(deadlinePrice).toBeGreaterThan(snapshotPrice);
    expect(deadlinePrice).toBeLessThanOrEqual(rateBound);
  },
);

propTest.prop([fc.bigInt({ min: window + 1n, max: window * 10_000n })], {
  numRuns: 1000,
})("entity deadlines beyond seven days are rejected", async (elapsed) => {
  const { now, paths } = setup();
  for (const path of paths) {
    expect(() => path(now + elapsed)).toThrow(InputExceedsMaxError);
  }
});

test.each(
  [0, 1, 2].flatMap((index) => [
    { index, clock: "string", explicit: true },
    { index, clock: "string", explicit: false },
    { index, clock: "number", explicit: false },
  ]),
)(
  "entity path $index rejects a $clock now (explicit deadline: $explicit)",
  async ({ index, clock, explicit }) => {
    const { now } = setup();
    const { paths } = setup(clock === "string" ? String(now) : Number(now));
    const rejected = Promise.resolve().then<unknown>(() =>
      paths[index]!(explicit ? now + window * 520n : undefined),
    );
    await expect(rejected).rejects.toBeInstanceOf(InvalidBigIntInputError);
    await expect(rejected).rejects.toMatchObject({ field: "now" });
  },
);
