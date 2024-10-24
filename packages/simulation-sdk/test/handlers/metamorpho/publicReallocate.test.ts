import _ from "lodash";
import { parseEther, parseUnits } from "viem";

import { NATIVE_ADDRESS } from "@morpho-org/blue-sdk";

import { describe, expect, test } from "vitest";
import {
  PublicAllocatorErrors,
  simulateOperation,
} from "../../../src/index.js";
import {
  dataFixture,
  marketA1,
  marketA2,
  tokenA,
  userB,
  vaultA,
} from "../../fixtures.js";

const type = "MetaMorpho_PublicReallocate";

describe(type, () => {
  test("should reallocate from market A1 to A2", () => {
    const assets = parseUnits("40", 6);
    const shares = parseUnits("40", 6 + 6);

    const result = simulateOperation(
      {
        type,
        sender: userB,
        address: vaultA.address,
        args: {
          withdrawals: [
            {
              id: marketA1.id,
              assets,
            },
          ],
          supplyMarketId: marketA2.id,
        },
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares = parseUnits(
      "960",
      6 + 6,
    );
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares = parseUnits(
      "440",
      6 + 6,
    );

    expected.markets[marketA1.id]!.totalSupplyAssets -= assets;
    expected.markets[marketA1.id]!.totalSupplyShares -= shares;

    expected.markets[marketA2.id]!.totalSupplyAssets += assets;
    expected.markets[marketA2.id]!.totalSupplyShares += shares;

    expected.holdings[userB]![NATIVE_ADDRESS]!.balance -= parseEther("0.005");
    expected.vaults[vaultA.address]!.publicAllocatorConfig!.accruedFee +=
      parseEther("0.005");

    expected.holdings[vaultA.address]![tokenA]!.erc20Allowances.morpho -=
      assets;

    expected.vaultMarketConfigs[vaultA.address]![marketA1.id]!
      .publicAllocatorConfig!.maxIn += assets;
    expected.vaultMarketConfigs[vaultA.address]![marketA1.id]!
      .publicAllocatorConfig!.maxOut -= assets;

    expected.vaultMarketConfigs[vaultA.address]![marketA2.id]!
      .publicAllocatorConfig!.maxIn -= assets;
    expected.vaultMarketConfigs[vaultA.address]![marketA2.id]!
      .publicAllocatorConfig!.maxOut += assets;

    expect(result).toEqual(expected);
  });

  test("should not reallocate from market A2 to A1 if max outflow exceeded", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: vaultA.address,
          args: {
            withdrawals: [
              {
                id: marketA2.id,
                assets: parseUnits("10", 6),
              },
            ],
            supplyMarketId: marketA1.id,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new PublicAllocatorErrors.MaxOutflowExceeded(vaultA.address, marketA2.id),
    );
  });

  test("should not reallocate from market A1 to A2 if max inflow exceeded", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: vaultA.address,
          args: {
            withdrawals: [
              {
                id: marketA1.id,
                assets: parseUnits("50", 6),
              },
            ],
            supplyMarketId: marketA2.id,
          },
        },
        dataFixture,
      ),
    ).toThrow(
      new PublicAllocatorErrors.MaxInflowExceeded(vaultA.address, marketA2.id),
    );
  });
});
