import { fc, test as propTest } from "@fast-check/vitest";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../test/fixtures/inKindRedeem.js";
import {
  InputExceedsMaxError,
  InvalidBigIntInputError,
} from "../types/index.js";
import { prepareVaultV1Deposit } from "./vaultv1/deposit.js";
import { prepareVaultV1MigrateToV2 } from "./vaultv1/migrateToV2.js";
import { prepareVaultV2Deposit } from "./vaultv2/deposit.js";

const window = 604_800n;
const target = "0x0000000000000000000000000000000000001012";

function setup(clock?: unknown) {
  const mock = createMockClient(mainnet);
  const v1 = inKindVaultV1Data();
  const v2 = inKindVaultV2Data({ address: target });
  const now = v2.lastUpdate;
  for (const address of [v1.asset, IN_KIND_VAULT]) {
    mockRead(mock, {
      address,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
  }
  const plan = {
    now: (clock ?? now) as bigint,
    account: IN_KIND_USER,
    chainId: 1,
    assets: 100n,
  };
  return {
    now,
    paths: [
      (expiresAt?: bigint) =>
        prepareVaultV1Deposit(mock.client, {
          ...plan,
          vault: v1,
          expiresAt: expiresAt === undefined ? undefined : Number(expiresAt),
        }),
      (expiresAt?: bigint) =>
        prepareVaultV2Deposit(mock.client, {
          ...plan,
          vault: v2,
          expiresAt: expiresAt === undefined ? undefined : Number(expiresAt),
        }),
      (expiresAt?: bigint) =>
        prepareVaultV1MigrateToV2(mock.client, {
          ...plan,
          sourceVault: v1,
          targetVault: v2,
          expiresAt: expiresAt === undefined ? undefined : Number(expiresAt),
        }),
    ],
  };
}

test.each([0, 1, 2])(
  "[INV-04] plan path %s accepts exactly seven days and rejects one second more",
  async (index) => {
    const { now, paths } = setup();
    await expect(
      Promise.resolve().then<unknown>(() => paths[index]!(now + window)),
    ).resolves.toBeDefined();
    const rejected = Promise.resolve().then<unknown>(() =>
      paths[index]!(now + window + 1n),
    );
    await expect(rejected).rejects.toBeInstanceOf(InputExceedsMaxError);
    await expect(rejected).rejects.toMatchObject({ field: "expiresAt" });
  },
);

propTest.prop([fc.bigInt({ min: window + 1n, max: window * 10_000n })], {
  numRuns: 1000,
})("plan deadlines beyond seven days are rejected", async (elapsed) => {
  const { now, paths } = setup();
  for (const path of paths) {
    await expect(path(now + elapsed)).rejects.toBeInstanceOf(
      InputExceedsMaxError,
    );
  }
});

test.each(
  [0, 1, 2].flatMap((index) => [
    { index, clock: "string", explicit: true },
    { index, clock: "string", explicit: false },
    { index, clock: "number", explicit: false },
  ]),
)(
  "plan path $index rejects a $clock now (explicit expiry: $explicit)",
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
