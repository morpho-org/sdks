import _ from "lodash";
import { maxUint256, parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
import {
  dataFixture,
  tokenA,
  userA,
  userB,
  vaultV2A,
  vaultV2B,
} from "../../fixtures.js";

const type = "VaultV2_Withdraw";

describe(type, () => {
  test("should withdraw assets from vault v1", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);

    const testFixture = _.cloneDeep(dataFixture);
    testFixture.holdings[userA]![vaultV2A.address]!.balance = shares;

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultV2A.address,
        args: {
          assets,
          onBehalf: userA,
          receiver: userB,
        },
      },
      testFixture,
    );

    const expected = _.cloneDeep(testFixture);
    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply -= shares;
    vaultV2Data.totalAssets -= assets;

    expected.holdings[userA]![vaultV2Data.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should burn shares from single market", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);

    const testFixture = _.cloneDeep(dataFixture);
    testFixture.holdings[userA]![vaultV2A.address]!.balance = shares;

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultV2A.address,
        args: {
          shares,
          onBehalf: userA,
          receiver: userB,
        },
      },
      testFixture,
    );

    const expected = _.cloneDeep(testFixture);
    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply -= shares;
    vaultV2Data.totalAssets -= assets;

    expected.holdings[userA]![vaultV2Data.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should withdraw assets from vault v1 using idle first", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);

    const testFixture = _.cloneDeep(dataFixture);
    testFixture.holdings[userA]![vaultV2A.address]!.balance = shares;
    testFixture.holdings[vaultV2A.address]![tokenA]!.balance = assets / 2n;

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultV2A.address,
        args: {
          assets,
          onBehalf: userA,
          receiver: userB,
        },
      },
      testFixture,
    );

    const expected = _.cloneDeep(testFixture);
    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply -= shares;
    vaultV2Data.totalAssets -= assets;

    expected.holdings[vaultV2A.address]![tokenA]!.balance = 0n;
    expected.holdings[userA]![vaultV2Data.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should burn shares from single market using idle first", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);

    const testFixture = _.cloneDeep(dataFixture);
    testFixture.holdings[userA]![vaultV2A.address]!.balance = shares;
    testFixture.holdings[vaultV2A.address]![tokenA]!.balance = assets / 2n;

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultV2A.address,
        args: {
          shares,
          onBehalf: userA,
          receiver: userB,
        },
      },
      testFixture,
    );

    const expected = _.cloneDeep(testFixture);
    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply -= shares;
    vaultV2Data.totalAssets -= assets;

    expected.holdings[userA]![vaultV2Data.address]!.balance -= shares;

    expected.holdings[vaultV2A.address]![tokenA]!.balance = 0n;

    expect(result).toEqual(expected);
  });

  test("should withdraw assets from idle", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);

    const testFixture = _.cloneDeep(dataFixture);
    testFixture.holdings[userA]![vaultV2A.address]!.balance = shares;
    testFixture.holdings[vaultV2A.address]![tokenA]!.balance = assets;

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultV2A.address,
        args: {
          assets,
          onBehalf: userA,
          receiver: userB,
        },
      },
      testFixture,
    );

    const expected = _.cloneDeep(testFixture);
    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply -= shares;
    vaultV2Data.totalAssets -= assets;

    expected.holdings[vaultV2A.address]![tokenA]!.balance = 0n;
    expected.holdings[userA]![vaultV2Data.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should burn shares from idle", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);

    const testFixture = _.cloneDeep(dataFixture);
    testFixture.holdings[userA]![vaultV2A.address]!.balance = shares;
    testFixture.holdings[vaultV2A.address]![tokenA]!.balance = assets;

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultV2A.address,
        args: {
          shares,
          onBehalf: userA,
          receiver: userB,
        },
      },
      testFixture,
    );

    const expected = _.cloneDeep(testFixture);
    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply -= shares;
    vaultV2Data.totalAssets -= assets;

    expected.holdings[userA]![vaultV2Data.address]!.balance -= shares;

    expected.holdings[vaultV2A.address]![tokenA]!.balance = 0n;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient supply", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: vaultV2A.address,
          args: {
            assets: maxUint256,
            onBehalf: userA,
            receiver: userB,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x200000000000000000000000000000000000000A"

      when simulating operation:
      {
        "type": "VaultV2_Withdraw",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "address": "0x200000000000000000000000000000000000000A",
        "args": {
          "assets": "115792089237316195423570985008687907853269984665640564039457584007913129639935n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"
        }
      }]
    `,
    );
  });

  test("should throw if not enough liquidity", () => {
    const assets = parseUnits("1", 18);
    const shares = parseUnits("1", 18);
    const testFixture = _.cloneDeep(dataFixture);
    testFixture.holdings[userA]![vaultV2B.address]!.balance = shares;
    testFixture.holdings[vaultV2B.address]![vaultV2B.asset]!.balance =
      assets - 1n;
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: vaultV2B.address,
          args: {
            assets,
            onBehalf: userA,
            receiver: userB,
          },
        },
        testFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient balance of user "0x200000000000000000000000000000000000000B" for token "0x2222222222222222222222222222222222222222"

      when simulating operation:
      {
        "type": "VaultV2_Withdraw",
        "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "address": "0x200000000000000000000000000000000000000B",
        "args": {
          "assets": "1000000000000000000n",
          "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          "receiver": "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"
        }
      }]
    `,
    );
  });
});
