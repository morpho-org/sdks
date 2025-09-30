import _ from "lodash";
import { maxUint256, parseUnits } from "viem";

import { simulateOperation } from "../../../src/index.js";
import {
  dataFixture,
  morphoVaultV1AdapterA,
  tokenA,
  tokenB,
  userA,
  userB,
  vaultV2A,
  vaultV2B,
} from "../../fixtures.js";

import { describe, expect, test } from "vitest";

const type = "VaultV2_Deposit";

describe(type, () => {
  test("should deposit assets to vault v1", async () => {
    const assets = parseUnits("1", 6);
    const shares = parseUnits("1", 18);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultV2A.address,
        args: {
          assets,
          onBehalf: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenA]!.balance -= assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply += shares;
    vaultV2Data.totalAssets += assets;

    expected.holdings[morphoVaultV1AdapterA.address]![tokenA]!.balance +=
      assets;
    expected.holdings[userA]![vaultV2A.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should mint shares to vault v1", async () => {
    const assets = parseUnits("1", 6);
    const shares = parseUnits("1", 18);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultV2A.address,
        args: {
          shares,
          onBehalf: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenA]!.balance -= assets;

    const vaultV2Data = expected.vaultV2s[vaultV2A.address]!;
    vaultV2Data.totalSupply += shares;
    vaultV2Data.totalAssets += assets;

    expected.holdings[morphoVaultV1AdapterA.address]![tokenA]!.balance +=
      assets;
    expected.holdings[userA]![vaultV2A.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should deposit assets to idle", async () => {
    const assets = parseUnits("1", 18);
    const shares = parseUnits("1", 18);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultV2B.address,
        args: {
          assets,
          onBehalf: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenB]!.balance -= assets;

    const vaultV2Data = expected.vaultV2s[vaultV2B.address]!;
    vaultV2Data.totalSupply += shares;
    vaultV2Data.totalAssets += assets;
    expected.holdings[vaultV2B.address]![tokenB]!.balance += assets;

    expected.holdings[userA]![vaultV2Data.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should mint shares to idle", async () => {
    const assets = parseUnits("1", 18);
    const shares = parseUnits("1", 18);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultV2B.address,
        args: {
          shares,
          onBehalf: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.holdings[userB]![tokenB]!.balance -= assets;

    const vaultV2Data = expected.vaultV2s[vaultV2B.address]!;
    vaultV2Data.totalSupply += shares;
    vaultV2Data.totalAssets += assets;
    expected.holdings[vaultV2B.address]![tokenB]!.balance += assets;

    expected.holdings[userA]![vaultV2Data.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient wallet balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: vaultV2A.address,
          args: {
            assets: maxUint256,
            onBehalf: userA,
          },
        },
        dataFixture,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
[Error: insufficient balance of user "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" for token "0x1111111111111111111111111111111111111111"

when simulating operation:
{
  "type": "VaultV2_Deposit",
  "sender": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
  "address": "0x200000000000000000000000000000000000000A",
  "args": {
    "assets": "115792089237316195423570985008687907853269984665640564039457584007913129639935n",
    "onBehalf": "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"
  }
}]
      `,
    );
  });
});
