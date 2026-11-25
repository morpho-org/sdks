import { Time } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import { maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ADAPTER,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import {
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "../../actions/vaultV2/index.js";
import { morphoViemExtension } from "../../client/index.js";
import { computeVaultMaxSharePrice } from "../../helpers/index.js";
import {
  EmptyDeallocationsError,
  InputExceedsMaxError,
  NonPositiveInputError,
} from "../../types/index.js";

describe("Vault V2 parsed handle equivalence", () => {
  const prepare = () => {
    const mock = createMockClient(mainnet);
    const entity = mock.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const vaultData = inKindVaultV2Data();
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
      vaultV2Deposit({
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
    expect(actual).toEqual(vaultV2Withdraw({ vault, args }));
    expect(Object.isFrozen(actual.action.args)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test("behavior: redeem output equals standalone without RPC", () => {
    const { mock, entity, vault, common } = prepare();
    const args = { ...common, shares: 100n };
    const actual = entity.redeem(args).buildTx();
    expect(actual).toEqual(vaultV2Redeem({ vault, args }));
    expect(Object.isFrozen(actual.action.args)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test("behavior: force-redeem output equals standalone without RPC", () => {
    const { mock, entity, vault, common } = prepare();
    const deallocations = [
      {
        adapter: IN_KIND_ADAPTER,
        amount: 100n,
        marketParams: inKindMarketParams,
      },
    ];
    const actual = entity
      .forceRedeem({
        deallocations,
        redeem: { shares: 100n },
        userAddress: common.userAddress,
      })
      .buildTx();
    expect(actual).toEqual(
      vaultV2ForceRedeem({
        vault,
        args: {
          deallocations,
          redeem: { shares: 100n, recipient: common.userAddress },
          onBehalf: common.userAddress,
        },
      }),
    );
    expect(Object.isFrozen(actual.action.args.deallocations)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test("behavior: force-withdraw output equals standalone with the derived bound, without RPC", () => {
    const { mock, entity, vaultData, vault, common } = prepare();
    const actual = entity
      .forceWithdraw({ ...common, exitAssets: 51n, vaultData })
      .buildTx();
    expect(actual).toEqual(
      vaultV2ForceWithdraw({
        vault,
        args: {
          ...common,
          adapter: IN_KIND_ADAPTER,
          exitAssets: 51n,
          minSharePriceE27: actual.action.args.minSharePriceE27,
        },
      }),
    );
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
      vaultV2InKindRedeem({
        vault,
        args: { ...args, adapter: IN_KIND_ADAPTER },
      }),
    );
    expect(Object.isFrozen(actual.action.args.marketParamsList)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
  });

  test("error: static force-redeem and redeem bounds fail before requirements", () => {
    const { entity, common } = prepare();
    expect(() =>
      entity.forceRedeem({
        deallocations: [],
        redeem: { shares: 0n },
        userAddress: common.userAddress,
      }),
    ).toThrow(EmptyDeallocationsError);
    expect(() =>
      entity.forceRedeem({
        deallocations: [{ adapter: IN_KIND_ADAPTER, amount: 0n }],
        redeem: { shares: 1n },
        userAddress: common.userAddress,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() => entity.redeem({ ...common, shares: maxUint256 + 1n })).toThrow(
      InputExceedsMaxError,
    );
  });
});
