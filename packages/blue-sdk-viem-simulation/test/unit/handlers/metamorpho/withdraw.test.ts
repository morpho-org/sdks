import _ from "lodash";
import { maxUint256, parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import {
  Erc20Errors,
  MetaMorphoErrors,
  simulateOperation,
} from "../../../../src/index.js";
import {
  dataFixture,
  marketA1,
  marketA2,
  tokenA,
  userA,
  userB,
  userC,
  vaultA,
  vaultC,
} from "../../fixtures.js";

const type = "MetaMorpho_Withdraw";

describe(type, () => {
  test("should withdraw assets from single market", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);
    const supplyShares = parseUnits("110", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultA.address,
        args: {
          assets,
          owner: userA,
          receiver: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    // expected.cacheId = expect.any(String);
    expected.markets[marketA2.id]!.totalSupplyAssets -= assets;
    expected.markets[marketA2.id]!.totalSupplyShares -= supplyShares;
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares -=
      supplyShares;

    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets -= assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply -= shares;

    expected.holdings[userA]![vaultA.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should burn shares from single market", async () => {
    const assets = parseUnits("110", 6);
    const shares = parseUnits("110", 18);
    const supplyShares = parseUnits("110", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultA.address,
        args: {
          shares,
          owner: userA,
          receiver: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    // expected.cacheId = expect.any(String);
    expected.markets[marketA2.id]!.totalSupplyAssets -= assets;
    expected.markets[marketA2.id]!.totalSupplyShares -= supplyShares;
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares -=
      supplyShares;

    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets -= assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply -= shares;

    expected.holdings[userA]![vaultA.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should withdraw assets from multiple markets", async () => {
    const assets = parseUnits("430", 6);
    const shares = parseUnits("430", 18);

    const supplyShares1 = parseUnits("30", 6 + 6);
    const supplyShares2 = parseUnits("400", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultA.address,
        args: {
          assets,
          owner: userA,
          receiver: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    // expected.cacheId = expect.any(String);
    expected.markets[marketA1.id]!.totalSupplyAssets -= parseUnits("30", 6);
    expected.markets[marketA1.id]!.totalSupplyShares -= supplyShares1;
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares -=
      supplyShares1;

    expected.markets[marketA2.id]!.totalSupplyAssets -= parseUnits("400", 6);
    expected.markets[marketA2.id]!.totalSupplyShares -= supplyShares2;
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares -=
      supplyShares2;

    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets -= assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply -= shares;

    expected.holdings[userA]![vaultA.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should burn shares from multiple markets", async () => {
    const assets = parseUnits("430", 6);
    const shares = parseUnits("430", 18);

    const supplyShares1 = parseUnits("30", 6 + 6);
    const supplyShares2 = parseUnits("400", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userA,
        address: vaultA.address,
        args: {
          shares,
          owner: userA,
          receiver: userB,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    // expected.cacheId = expect.any(String);
    expected.markets[marketA1.id]!.totalSupplyAssets -= parseUnits("30", 6);
    expected.markets[marketA1.id]!.totalSupplyShares -= supplyShares1;
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares -=
      supplyShares1;

    expected.markets[marketA2.id]!.totalSupplyAssets -= parseUnits("400", 6);
    expected.markets[marketA2.id]!.totalSupplyShares -= supplyShares2;
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares -=
      supplyShares2;

    expected.holdings[userB]![tokenA]!.balance += assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets -= assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply -= shares;

    expected.holdings[userA]![vaultA.address]!.balance -= shares;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient supply", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: vaultA.address,
          args: {
            assets: maxUint256,
            owner: userA,
            receiver: userB,
          },
        },
        dataFixture,
      ),
    ).toThrow(new Erc20Errors.InsufficientBalance(vaultA.address, userA));
  });

  test("should throw if not enough liquidity", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userC,
          address: vaultC.address,
          args: {
            assets: parseUnits("15000", 6),
            owner: userC,
            receiver: userB,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new MetaMorphoErrors.NotEnoughLiquidity(
        vaultC.address,
        parseUnits("14000", 6),
      ),
    );
  });
});
