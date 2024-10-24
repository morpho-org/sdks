import _ from "lodash";
import { maxUint256, parseUnits } from "viem";

import {
  Erc20Errors,
  MetaMorphoErrors,
  simulateOperation,
} from "../../../src/index.js";
import {
  dataFixture,
  marketA1,
  marketA2,
  tokenA,
  userA,
  userB,
  vaultA,
} from "../../fixtures.js";

import { describe, expect, test } from "vitest";

const type = "MetaMorpho_Deposit";

describe(type, () => {
  test("should deposit assets to single market", async () => {
    const assets = parseUnits("1", 6);
    const shares = parseUnits("1", 18);
    const supplyShares = parseUnits("1", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultA.address,
        args: {
          assets,
          owner: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets += assets;
    expected.markets[marketA1.id]!.totalSupplyShares += supplyShares;
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares +=
      supplyShares;

    expected.vaultUsers[vaultA.address]![userB]!.allowance -= assets;
    expected.holdings[userB]![tokenA]!.balance -= assets;
    expected.holdings[vaultA.address]![tokenA]!.erc20Allowances.morpho -=
      assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets += assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply += shares;

    expected.holdings[userA]![vaultA.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should mint shares to single market", async () => {
    const assets = parseUnits("1", 6);
    const shares = parseUnits("1", 18);
    const supplyShares = parseUnits("1", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultA.address,
        args: {
          shares,
          owner: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets += assets;
    expected.markets[marketA1.id]!.totalSupplyShares += supplyShares;
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares +=
      supplyShares;

    expected.vaultUsers[vaultA.address]![userB]!.allowance -= assets;
    expected.holdings[userB]![tokenA]!.balance -= assets;
    expected.holdings[vaultA.address]![tokenA]!.erc20Allowances.morpho -=
      assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets += assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply += shares;

    expected.holdings[userA]![vaultA.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should deposit assets to multiple markets", async () => {
    const assets = parseUnits("11", 6);
    const shares = parseUnits("11", 18);

    const supplyShares1 = parseUnits("10", 6 + 6);
    const supplyShares2 = parseUnits("1", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultA.address,
        args: {
          assets,
          owner: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets += parseUnits("10", 6);
    expected.markets[marketA1.id]!.totalSupplyShares += supplyShares1;
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares +=
      supplyShares1;

    expected.markets[marketA2.id]!.totalSupplyAssets += parseUnits("1", 6);
    expected.markets[marketA2.id]!.totalSupplyShares += supplyShares2;
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares +=
      supplyShares2;

    expected.vaultUsers[vaultA.address]![userB]!.allowance -= assets;
    expected.holdings[userB]![tokenA]!.balance -= assets;
    expected.holdings[vaultA.address]![tokenA]!.erc20Allowances.morpho -=
      assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets += assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply += shares;
    expected.holdings[userA]![vaultA.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should mint shares to multiple markets", async () => {
    const assets = parseUnits("11", 6);
    const shares = parseUnits("11", 18);

    const supplyShares1 = parseUnits("10", 6 + 6);
    const supplyShares2 = parseUnits("1", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultA.address,
        args: {
          shares,
          owner: userA,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.markets[marketA1.id]!.totalSupplyAssets += parseUnits("10", 6);
    expected.markets[marketA1.id]!.totalSupplyShares += supplyShares1;
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares +=
      supplyShares1;

    expected.markets[marketA2.id]!.totalSupplyAssets += parseUnits("1", 6);
    expected.markets[marketA2.id]!.totalSupplyShares += supplyShares2;
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares +=
      supplyShares2;

    expected.vaultUsers[vaultA.address]![userB]!.allowance -= assets;
    expected.holdings[userB]![tokenA]!.balance -= assets;
    expected.holdings[vaultA.address]![tokenA]!.erc20Allowances.morpho -=
      assets;

    const vaultData = expected.vaults[vaultA.address]!;
    vaultData.totalAssets += assets;
    vaultData.lastTotalAssets = vaultData.totalAssets;
    vaultData.totalSupply += shares;

    expected.holdings[userA]![vaultA.address]!.balance += shares;

    expect(result).toEqual(expected);
  });

  test("should throw if insufficient wallet balance", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userA,
          address: vaultA.address,
          args: {
            assets: maxUint256,
            owner: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(new Erc20Errors.InsufficientBalance(tokenA, userA));
  });

  test("should throw if all caps reached", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: vaultA.address,
          args: {
            assets: parseUnits("1000", 6),
            owner: userA,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new MetaMorphoErrors.AllCapsReached(vaultA.address, parseUnits("890", 6)),
    );
  });
});
