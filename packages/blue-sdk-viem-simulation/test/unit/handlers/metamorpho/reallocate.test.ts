import _ from "lodash";
import { maxUint256, parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import {
  MetaMorphoErrors,
  UnknownVaultMarketConfigError,
  simulateOperation,
} from "../../../../src/index.js";
import {
  dataFixture,
  marketA1,
  marketA2,
  marketB1,
  tokenA,
  userB,
  vaultA,
  vaultB,
} from "../../fixtures.js";

const type = "MetaMorpho_Reallocate";

describe(type, () => {
  test("should reallocate from market A1 to A2", () => {
    const result = simulateOperation(
      {
        type,
        sender: dataFixture.vaults[vaultA.address]!.owner,
        address: vaultA.address,
        args: [
          {
            id: marketA1.id,
            assets: parseUnits("950", 6),
          },
          {
            id: marketA2.id,
            assets: maxUint256,
          },
        ],
      },
      dataFixture,
    );

    const expected = _.cloneDeep(dataFixture);
    expected.positions[vaultA.address]![marketA1.id]!.supplyShares = parseUnits(
      "950",
      6 + 6,
    );
    expected.positions[vaultA.address]![marketA2.id]!.supplyShares = parseUnits(
      "450",
      6 + 6,
    );

    expected.holdings[vaultA.address]![tokenA]!.erc20Allowances.morpho -=
      parseUnits("50", 6);

    expected.markets[marketA1.id]!.totalSupplyAssets -= parseUnits("50", 6);
    expected.markets[marketA1.id]!.totalSupplyShares -= parseUnits("50", 6 + 6);

    expected.markets[marketA2.id]!.totalSupplyAssets += parseUnits("50", 6);
    expected.markets[marketA2.id]!.totalSupplyShares += parseUnits("50", 6 + 6);

    expect(result).toEqual(expected);
  });

  test("should not reallocate if inconsistent reallocation", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: dataFixture.vaults[vaultA.address]!.owner,
          address: vaultA.address,
          args: [
            {
              id: marketA1.id,
              assets: parseUnits("950", 6),
            },
            {
              id: marketA2.id,
              assets: parseUnits("430", 6),
            },
          ],
        },
        dataFixture,
      ),
    ).toThrow(
      new MetaMorphoErrors.InconsistentReallocation(
        vaultA.address,
        parseUnits("30", 6),
        parseUnits("50", 6),
      ),
    );
  });

  test("should not reallocate from market A1 to B1", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: dataFixture.vaults[vaultA.address]!.owner,
          address: vaultA.address,
          args: [
            {
              id: marketA1.id,
              assets: parseUnits("950", 6),
            },
            {
              id: marketB1.id,
              assets: maxUint256,
            },
          ],
        },
        dataFixture,
      ),
    ).toThrow(new UnknownVaultMarketConfigError(vaultA.address, marketB1.id));
  });

  test("should not reallocate if not allocator", () => {
    expect(() =>
      simulateOperation(
        {
          type,
          sender: userB,
          address: vaultB.address,
          args: [
            {
              id: marketA1.id,
              assets: parseUnits("950", 6),
            },
            {
              id: marketB1.id,
              assets: maxUint256,
            },
          ],
        },
        dataFixture,
      ),
    ).toThrow(new MetaMorphoErrors.NotAllocatorRole(vaultB.address, userB));
  });
});
