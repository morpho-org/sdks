import { Time } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import { maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import {
  vaultV1Deposit,
  vaultV1InKindRedeem,
  vaultV1MigrateToV2,
  vaultV1Redeem,
  vaultV1Withdraw,
} from "../../actions/vaultV1/index.js";
import { morphoViemExtension } from "../../client/index.js";
import { computeVaultMaxSharePrice } from "../../helpers/index.js";
import { InputExceedsMaxError } from "../../types/index.js";

describe("Vault V1 parsed handle equivalence", () => {
  const prepare = () => {
    const mock = createMockClient(mainnet);
    const entity = mock.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const vaultData = inKindVaultV1Data();
    const vault = {
      chainId: mainnet.id,
      address: IN_KIND_VAULT,
      asset: vaultData.asset,
    };
    const common = {
      userAddress: IN_KIND_USER,
      deadline: Time.timestamp() + 3600n,
    };
    return { mock, entity, vaultData, vault, common };
  };

  test("behavior: deposit output equals standalone without RPC", () => {
    const { mock, entity, vaultData, vault, common } = prepare();
    const args = { ...common, amount: 100n, slippageTolerance: 0n };
    const actual = entity.deposit({ ...args, vaultData }).buildTx();
    expect(actual).toEqual(
      vaultV1Deposit({
        vault,
        args: {
          ...args,
          maxSharePrice: computeVaultMaxSharePrice({
            vaultData,
            assets: args.amount,
            deadline: args.deadline,
            slippageTolerance: 0n,
          }),
        },
      }),
    );
    expect(Object.isFrozen(actual.action.args)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test("behavior: withdraw output equals standalone without RPC", () => {
    const { mock, entity, vaultData, vault, common } = prepare();
    const args = { ...common, amount: 100n };
    const actual = entity.withdraw({ ...args, vaultData }).buildTx();
    expect(actual).toEqual(vaultV1Withdraw({ vault, args }));
    expect(Object.isFrozen(actual.action.args)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test("behavior: redeem output equals standalone without RPC", () => {
    const { mock, entity, vault, common } = prepare();
    const args = { ...common, shares: 100n };
    const actual = entity.redeem(args).buildTx();
    expect(actual).toEqual(vaultV1Redeem({ vault, args }));
    expect(Object.isFrozen(actual.action.args)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test("behavior: in-kind output equals standalone without RPC", () => {
    const { mock, entity, vaultData, vault, common } = prepare();
    const args = {
      ...common,
      amount: 100n,
      marketParamsList: [inKindMarketParams],
    };
    const actual = entity.inKindRedeem({ ...args, vaultData }).buildTx();
    expect(actual).toEqual(
      vaultV1InKindRedeem({
        vault,
        args,
      }),
    );
    expect(Object.isFrozen(actual.action.args.marketParamsList)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test.each(["assets", "shares"] as const)(
    "behavior: migration %s output equals standalone without RPC",
    (mode) => {
      const { mock, entity, vaultData, vault, common } = prepare();
      const targetVault = inKindVaultV2Data({
        address: "0x0000000000000000000000000000000000000012",
      });
      const amount = mode === "assets" ? { assets: 100n } : { shares: 100n };
      const actual = entity
        .migrateToV2({
          ...common,
          ...amount,
          sourceVault: vaultData,
          targetVault,
        })
        .buildTx();
      expect(actual).toEqual(
        vaultV1MigrateToV2({
          vault,
          args: {
            ...common,
            ...amount,
            targetVault: targetVault.address,
            targetAsset: targetVault.asset,
            maxSharePriceVaultV2: actual.action.args.maxSharePriceVaultV2,
          },
        }),
      );
      expect(Object.isFrozen(actual.action.args)).toBe(true);
      expect(mock.request).not.toHaveBeenCalled();
    },
  );

  test("error: redeem overflow fails at handle creation without RPC", () => {
    const { mock, entity, common } = prepare();
    expect(() => entity.redeem({ ...common, shares: maxUint256 + 1n })).toThrow(
      InputExceedsMaxError,
    );
    expect(mock.request).not.toHaveBeenCalled();
  });
});
