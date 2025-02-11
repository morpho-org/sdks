import _ from "lodash";
import { maxUint256, parseUnits } from "viem";

import { describe, expect, test } from "vitest";
import { simulateOperation } from "../../../src/index.js";
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
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: inconsistent reallocation for vault "0x000000000000000000000000000000000000000A": total supplied (30000000) != total withdrawn (50000000)]`,
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
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: unknown config for vault "0x000000000000000000000000000000000000000A" on market "0x6ac1b39121c55504e845c0a07000bee40d85b9d432992ee34b00fa03b5d19b95"]`,
    );
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
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: account 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB not allocator of vault "0x000000000000000000000000000000000000000b"]`,
    );
  });
});
