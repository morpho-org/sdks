import { getChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, maxUint256, zeroAddress } from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  AmountAndSharesExclusiveError,
  EmptyMarketParamsListError,
  type Erc2612RequirementSignature,
  InputExceedsMaxError,
  MixedBundlesFundingError,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
  SameVaultMigrationError,
  VaultAssetMismatchError,
} from "../../types/index.js";
import {
  buildVaultV1Deposit,
  parseVaultV1DepositInput,
  type VaultV1DepositParams,
  vaultV1Deposit,
} from "./deposit.js";
import {
  buildVaultV1InKindRedeem,
  parseVaultV1InKindRedeem,
  type VaultV1InKindRedeemParams,
} from "./inKindRedeem.js";
import {
  buildVaultV1MigrateToV2,
  parseVaultV1MigrateToV2,
  type VaultV1MigrateToV2Params,
} from "./migrateToV2.js";
import {
  buildVaultV1Redeem,
  parseVaultV1Redeem,
  type VaultV1RedeemParams,
} from "./redeem.js";
import {
  buildVaultV1Withdraw,
  parseVaultV1Withdraw,
  type VaultV1WithdrawParams,
} from "./withdraw.js";

const target = "0x0000000000000000000000000000000000000012";
const vault = {
  chainId: 1,
  address: zeroAddress,
  asset: getChainAddresses(1).wNative!,
};
const common = { userAddress: zeroAddress, deadline: 1_900_000_000n };
const market = {
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
};
const migration = {
  vault,
  args: {
    ...common,
    assets: 1n,
    targetVault: target,
    targetAsset: vault.asset,
    maxSharePriceVaultV2: 1n,
  },
} as const;

describe("Vault V1 complete raw params", () => {
  test("error: complete inputs transport optional signatures, but no signature is permanently trusted", () => {
    const signature = {
      args: {
        owner: zeroAddress,
        asset: vault.address,
        amount: 1n,
        nonce: 0n,
        deadline: 0n,
        signature: "0x",
      },
      action: {
        type: "permit",
        args: { spender: zeroAddress, amount: 1n, deadline: 0n },
      },
    } as const satisfies Erc2612RequirementSignature;
    const withdraw = parseVaultV1Withdraw({
      vault,
      args: { ...common, amount: 1n, requirementSignature: signature },
    });
    const redeem = parseVaultV1Redeem({
      vault,
      args: { ...common, shares: 1n, requirementSignature: signature },
    });
    const inKind = parseVaultV1InKindRedeem({
      vault,
      args: {
        ...common,
        amount: 1n,
        marketParamsList: [market],
        requirementSignature: signature,
      },
    });
    const migrate = parseVaultV1MigrateToV2({
      ...migration,
      args: { ...migration.args, requirementSignature: signature },
    });
    for (const encode of [
      () => buildVaultV1Withdraw(withdraw),
      () => buildVaultV1Redeem(redeem),
      () => buildVaultV1InKindRedeem(inKind),
      () => buildVaultV1MigrateToV2(migrate),
      () =>
        buildVaultV1Redeem(
          parseVaultV1Redeem({ vault, args: { ...common, shares: 1n } }),
          { requirementSignature: signature },
        ),
    ])
      expect(encode).toThrow(NonPositiveInputError);
    // A fresh override does not inherit the earlier invalid signature.
    expect(() => buildVaultV1Redeem(redeem, {})).not.toThrow();
  });
  test("types: every constructor accepts raw public params; no raw operation can reach an internal builder", () => {
    expectTypeOf<
      Parameters<typeof parseVaultV1DepositInput>[0]
    >().toEqualTypeOf<VaultV1DepositParams>();
    expectTypeOf<
      Parameters<typeof parseVaultV1Withdraw>[0]
    >().toEqualTypeOf<VaultV1WithdrawParams>();
    expectTypeOf<
      Parameters<typeof parseVaultV1Redeem>[0]
    >().toEqualTypeOf<VaultV1RedeemParams>();
    expectTypeOf<
      Parameters<typeof parseVaultV1InKindRedeem>[0]
    >().toEqualTypeOf<VaultV1InKindRedeemParams>();
    expectTypeOf<
      Parameters<typeof parseVaultV1MigrateToV2>[0]
    >().toEqualTypeOf<VaultV1MigrateToV2Params>();
    expectTypeOf<VaultV1DepositParams>().not.toExtend<
      Parameters<typeof buildVaultV1Deposit>[0]
    >();
    expectTypeOf<VaultV1WithdrawParams>().not.toExtend<
      Parameters<typeof buildVaultV1Withdraw>[0]
    >();
    expectTypeOf<VaultV1RedeemParams>().not.toExtend<
      Parameters<typeof buildVaultV1Redeem>[0]
    >();
    expectTypeOf<VaultV1InKindRedeemParams>().not.toExtend<
      Parameters<typeof buildVaultV1InKindRedeem>[0]
    >();
    expectTypeOf<VaultV1MigrateToV2Params>().not.toExtend<
      Parameters<typeof buildVaultV1MigrateToV2>[0]
    >();
  });

  test("behavior: complete deposit normalizes defaults and snapshots raw params without changing calldata", () => {
    const params = {
      vault: { ...vault, address: vault.address as Address },
      args: { ...common, amount: maxUint256, maxSharePrice: maxUint256 },
    };
    const parsed = parseVaultV1DepositInput(params);
    const expected = vaultV1Deposit(params);
    params.args.amount = 1n;
    params.vault.address = target;
    expect(buildVaultV1Deposit(parsed)).toEqual(expected);
    expect(parsed.common.referralFeePct).toBe(0n);
    expect(parsed.common.referralFeeRecipient).toBe(zeroAddress);
    expect(Object.isFrozen(expected)).toBe(true);
    expect(Object.isFrozen(expected.action.args)).toBe(true);
  });

  test.each([-1n, 0n])(
    "error: deposit bound positivity precedes funding overflow (%s)",
    (bound) => {
      expect(() =>
        parseVaultV1DepositInput({
          vault,
          args: { ...common, amount: maxUint256 + 1n, maxSharePrice: bound },
        }),
      ).toThrow(NonPositiveInputError);
    },
  );

  test("error: deposit preserves funding, ABI, native and common precedence", () => {
    expect(() =>
      vaultV1Deposit({
        vault,
        args: {
          ...common,
          amount: 1n,
          nativeAmount: 1n,
          maxSharePrice: 0n,
        } as never,
      }),
    ).toThrow(MixedBundlesFundingError);
    expect(() =>
      vaultV1Deposit({
        vault,
        args: { ...common, amount: -1n, maxSharePrice: 0n },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      vaultV1Deposit({
        vault,
        args: { ...common, amount: 0n, maxSharePrice: 1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      vaultV1Deposit({
        vault,
        args: { ...common, amount: 1n, maxSharePrice: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      vaultV1Deposit({
        vault: { ...vault, asset: zeroAddress },
        args: { ...common, nativeAmount: 1n, maxSharePrice: 1n, deadline: 0n },
      }),
    ).toThrow(NativeAmountOnNonWNativeVaultError);
  });

  test.each([
    [
      "withdraw",
      (amount: bigint, deadline: bigint) =>
        parseVaultV1Withdraw({ vault, args: { ...common, amount, deadline } }),
    ],
    [
      "redeem",
      (shares: bigint, deadline: bigint) =>
        parseVaultV1Redeem({ vault, args: { ...common, shares, deadline } }),
    ],
  ] as const)(
    "behavior/error: %s positive uint256 and first-error contract",
    (_name, parse) => {
      for (const amount of [-1n, 0n])
        expect(() => parse(amount, 0n)).toThrow(NonPositiveInputError);
      expect(() => parse(maxUint256 + 1n, 0n)).toThrow(InputExceedsMaxError);
      expect(() => parse(1n, 0n)).toThrow(NonPositiveInputError);
      expect(() => parse(1n, maxUint256 + 1n)).toThrow(InputExceedsMaxError);
      expect(() => parse(maxUint256, maxUint256)).not.toThrow();
    },
  );

  test.each([
    [
      "withdraw",
      (referralFeePct: bigint) =>
        parseVaultV1Withdraw({
          vault,
          args: { ...common, amount: 1n, referralFeePct },
        }),
    ],
    [
      "redeem",
      (referralFeePct: bigint) =>
        parseVaultV1Redeem({
          vault,
          args: { ...common, shares: 1n, referralFeePct },
        }),
    ],
  ] as const)("error: %s common fee contract", (_name, parse) => {
    expect(() => parse(-1n)).toThrow(NegativeInputError);
    expect(() => parse(1n)).toThrow(ReferralFeeRecipientMissingError);
    expect(() => parse(10n ** 18n)).toThrow(ReferralFeePctExceededError);
  });

  test("behavior/error: in-kind owns plain market tuples and keeps positive-only amounts", () => {
    const params = {
      vault,
      args: { ...common, amount: 1n, marketParamsList: [{ ...market }] },
    };
    for (const amount of [-1n, 0n])
      expect(() =>
        parseVaultV1InKindRedeem({
          ...params,
          args: { ...params.args, amount },
        }),
      ).toThrow(NonPositiveInputError);
    // This pre-existing positive-only amount contract is not a uint256 parser.
    expect(
      parseVaultV1InKindRedeem({
        ...params,
        args: { ...params.args, amount: maxUint256 + 1n },
      }).args.amount,
    ).toBe(maxUint256 + 1n);
    expect(() =>
      parseVaultV1InKindRedeem({
        ...params,
        args: {
          ...params.args,
          deadline: maxUint256 + 1n,
          marketParamsList: [],
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      parseVaultV1InKindRedeem({
        ...params,
        args: { ...params.args, marketParamsList: [] },
      }),
    ).toThrow(EmptyMarketParamsListError);
    const parsed = parseVaultV1InKindRedeem(params);
    const tx = buildVaultV1InKindRedeem(parsed);
    params.args.marketParamsList[0]!.lltv = 1n;
    params.args.marketParamsList.length = 0;
    expect(buildVaultV1InKindRedeem(parsed)).toEqual(tx);
    expect(parsed.args.marketParamsList).toEqual([market]);
    expect(Object.isFrozen(parsed.args.marketParamsList[0])).toBe(true);
    expect(Object.getPrototypeOf(parsed.args.marketParamsList[0])).toBe(
      Object.prototype,
    );
  });

  test("error: complete migration owns cross-field vault, amount, price and ABI checks", () => {
    const parse = (args: VaultV1MigrateToV2Params["args"]) =>
      parseVaultV1MigrateToV2({ vault, args });
    expect(() =>
      parse({
        ...migration.args,
        targetAsset: zeroAddress,
        targetVault: vault.address,
        assets: 0n,
      }),
    ).toThrow(VaultAssetMismatchError);
    expect(() =>
      parse({ ...migration.args, targetVault: vault.address, assets: 0n }),
    ).toThrow(SameVaultMigrationError);
    expect(() => parse({ ...migration.args, shares: 1n } as never)).toThrow(
      AmountAndSharesExclusiveError,
    );
    const { assets: _assets, ...base } = migration.args;
    expect(() => parse(base as never)).toThrow(AmountAndSharesExclusiveError);
    for (const amount of [-1n, 0n]) {
      expect(() => parse({ ...base, assets: amount })).toThrow(
        NonPositiveInputError,
      );
      expect(() => parse({ ...base, shares: amount })).toThrow(
        NonPositiveInputError,
      );
    }
    expect(() =>
      parse({ ...base, assets: maxUint256 + 1n, maxSharePriceVaultV2: 0n }),
    ).toThrow(NonPositiveInputError);
    expect(() => parse({ ...base, assets: maxUint256 + 1n })).toThrow(
      InputExceedsMaxError,
    );
    expect(() =>
      parse({ ...base, shares: 1n, maxSharePriceVaultV2: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
    expect(
      parse({ ...base, shares: maxUint256, maxSharePriceVaultV2: maxUint256 })
        .bounds.shares,
    ).toBe(maxUint256);
  });
});
