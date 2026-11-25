import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddresses } from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  IntegerOutOfRangeError,
  maxUint256,
  zeroAddress,
} from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import { parseDeadline } from "../../helpers/parse.js";
import {
  EmptyDeallocationsError,
  type Erc2612RequirementSignature,
  InputExceedsMaxError,
  MixedBundlesFundingError,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";
import {
  buildVaultV2Deposit,
  parseVaultV2DepositInput,
  vaultV2Deposit,
} from "./deposit.js";
import {
  buildVaultV2ForceRedeem,
  parseVaultV2ForceRedeem,
  vaultV2ForceRedeem,
} from "./forceRedeem.js";
import {
  buildVaultV2ForceWithdraw,
  parseVaultV2ForceWithdraw,
} from "./forceWithdraw.js";
import {
  buildVaultV2InKindRedeem,
  parseVaultV2InKindRedeem,
} from "./inKindRedeem.js";
import { buildVaultV2Redeem, parseVaultV2Redeem } from "./redeem.js";
import { buildVaultV2Withdraw, parseVaultV2Withdraw } from "./withdraw.js";

const vault = {
  chainId: 1,
  address: zeroAddress,
  asset: getChainAddresses(1).wNative!,
};
const common = { userAddress: zeroAddress, deadline: 1_900_000_000n };
const exit = {
  ...common,
  adapter: zeroAddress,
  exitAssets: 1n,
  minSharePriceE27: 0n,
};

describe("Vault V2 complete raw params", () => {
  test.each([{ present: [] }, { present: [0] }, { present: [1] }])(
    "error: rejects sparse force-redeem deallocations with indexes $present",
    ({ present }) => {
      const deallocations: Parameters<
        typeof vaultV2ForceRedeem
      >[0]["args"]["deallocations"][number][] = new Array(2);
      for (const index of present) {
        deallocations[index] = { adapter: zeroAddress, amount: 1n };
      }
      expect(() =>
        vaultV2ForceRedeem({
          vault,
          args: {
            deallocations,
            redeem: { shares: 1n, recipient: zeroAddress },
            onBehalf: zeroAddress,
          },
        }),
      ).toThrow(TypeError);
    },
  );
  test("error: complete inputs transport optional signatures, with fresh validation at each encode", () => {
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
    const withdraw = parseVaultV2Withdraw({
      vault,
      args: { ...common, amount: 1n, requirementSignature: signature },
    });
    const redeem = parseVaultV2Redeem({
      vault,
      args: { ...common, shares: 1n, requirementSignature: signature },
    });
    const inKind = parseVaultV2InKindRedeem({
      vault,
      args: {
        ...common,
        adapter: zeroAddress,
        amount: 1n,
        marketParamsList: [],
        requirementSignature: signature,
      },
    });
    const force = parseVaultV2ForceWithdraw({
      vault,
      args: { ...exit, requirementSignature: signature },
    });
    for (const encode of [
      () => buildVaultV2Withdraw(withdraw),
      () => buildVaultV2Redeem(redeem),
      () => buildVaultV2InKindRedeem(inKind),
      () => buildVaultV2ForceWithdraw(force),
      () =>
        buildVaultV2Redeem(
          parseVaultV2Redeem({ vault, args: { ...common, shares: 1n } }),
          { requirementSignature: signature },
        ),
    ])
      expect(encode).toThrow(NonPositiveInputError);
    expect(() => buildVaultV2Redeem(redeem, {})).not.toThrow();
  });
  test("types: complete raw operations cannot bypass their constructors", () => {
    expectTypeOf<Parameters<typeof vaultV2Deposit>[0]>().toEqualTypeOf<
      Parameters<typeof parseVaultV2DepositInput>[0]
    >();
    expectTypeOf<Parameters<typeof parseVaultV2DepositInput>[0]>().not.toExtend<
      Parameters<typeof buildVaultV2Deposit>[0]
    >();
    expectTypeOf<Parameters<typeof parseVaultV2Withdraw>[0]>().not.toExtend<
      Parameters<typeof buildVaultV2Withdraw>[0]
    >();
    expectTypeOf<Parameters<typeof parseVaultV2Redeem>[0]>().not.toExtend<
      Parameters<typeof buildVaultV2Redeem>[0]
    >();
    expectTypeOf<
      Parameters<typeof parseVaultV2ForceWithdraw>[0]
    >().not.toExtend<Parameters<typeof buildVaultV2ForceWithdraw>[0]>();
    expectTypeOf<Parameters<typeof parseVaultV2InKindRedeem>[0]>().not.toExtend<
      Parameters<typeof buildVaultV2InKindRedeem>[0]
    >();
    expectTypeOf<Parameters<typeof parseVaultV2ForceRedeem>[0]>().not.toExtend<
      Parameters<typeof buildVaultV2ForceRedeem>[0]
    >();
  });

  test.each([-1n, 0n])(
    "error: deposit share-price positivity precedes funding overflow (%s)",
    (maxSharePrice) => {
      expect(() =>
        vaultV2Deposit({
          vault,
          args: { ...common, amount: maxUint256 + 1n, maxSharePrice },
        }),
      ).toThrow(NonPositiveInputError);
    },
  );

  test("behavior: complete deposit preserves normalized data without carrying a signature", () => {
    const params = {
      vault,
      args: { ...common, amount: maxUint256, maxSharePrice: maxUint256 },
    };
    const parsed = parseVaultV2DepositInput(params);
    expect(buildVaultV2Deposit(parsed)).toEqual(vaultV2Deposit(params));
    expect(parsed.requirementSignature).toBeUndefined();
    expect(parsed.funding.assets).toBe(maxUint256);
  });

  test("error: deposit funding/native/common precedence", () => {
    expect(() =>
      vaultV2Deposit({
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
      vaultV2Deposit({
        vault,
        args: { ...common, amount: -1n, maxSharePrice: 0n },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      vaultV2Deposit({
        vault,
        args: { ...common, amount: 1n, maxSharePrice: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      vaultV2Deposit({
        vault: { ...vault, asset: zeroAddress },
        args: { ...common, nativeAmount: 1n, maxSharePrice: 1n, deadline: 0n },
      }),
    ).toThrow(NativeAmountOnNonWNativeVaultError);
  });

  test.each([
    [
      "withdraw",
      (amount: bigint, deadline = common.deadline) =>
        parseVaultV2Withdraw({ vault, args: { ...common, amount, deadline } }),
    ],
    [
      "redeem",
      (shares: bigint, deadline = common.deadline) =>
        parseVaultV2Redeem({ vault, args: { ...common, shares, deadline } }),
    ],
    [
      "forceWithdraw",
      (exitAssets: bigint, deadline = common.deadline) =>
        parseVaultV2ForceWithdraw({
          vault,
          args: { ...exit, exitAssets, deadline },
        }),
    ],
  ] as const)(
    "behavior/error: %s positive uint256 amount contract",
    (_name, parse) => {
      expect(() => parse(-1n, 0n)).toThrow(NonPositiveInputError);
      expect(() => parse(0n, 0n)).toThrow(NonPositiveInputError);
      expect(() => parse(maxUint256 + 1n, 0n)).toThrow(InputExceedsMaxError);
      expect(() => parse(1n, 0n)).toThrow(NonPositiveInputError);
      expect(() => parse(1n, maxUint256 + 1n)).toThrow(InputExceedsMaxError);
      expect(() => parse(maxUint256, maxUint256)).not.toThrow();
    },
  );

  test("error: withdrawal and redemption common fields validate deadline before referral", () => {
    for (const parse of [
      () =>
        parseVaultV2Withdraw({
          vault,
          args: { ...common, amount: 1n, deadline: 0n, referralFeePct: -1n },
        }),
      () =>
        parseVaultV2Redeem({
          vault,
          args: { ...common, shares: 1n, deadline: 0n, referralFeePct: -1n },
        }),
    ])
      expect(parse).toThrow(NonPositiveInputError);
    expect(() =>
      parseVaultV2Redeem({
        vault,
        args: { ...common, shares: 1n, referralFeePct: 1n },
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      parseVaultV2Withdraw({
        vault,
        args: { ...common, amount: 1n, referralFeePct: 10n ** 18n },
      }),
    ).toThrow(ReferralFeePctExceededError);
  });

  test("behavior/error: force-withdraw deadline, floor, referral order and zero floor", () => {
    expect(
      parseVaultV2ForceWithdraw({ vault, args: exit }).args.minSharePriceE27,
    ).toBe(0n);
    expect(() =>
      parseVaultV2ForceWithdraw({
        vault,
        args: { ...exit, deadline: 0n, minSharePriceE27: -1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      parseVaultV2ForceWithdraw({
        vault,
        args: { ...exit, minSharePriceE27: -1n, referralFeePct: -1n },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      parseVaultV2ForceWithdraw({
        vault,
        args: {
          ...exit,
          minSharePriceE27: maxUint256 + 1n,
          referralFeePct: -1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      parseVaultV2ForceWithdraw({
        vault,
        args: { ...exit, referralFeePct: -1n },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      parseVaultV2ForceWithdraw({
        vault,
        args: { ...exit, referralFeePct: 1n },
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      parseVaultV2ForceWithdraw({
        vault,
        args: { ...exit, referralFeePct: 10n ** 18n },
      }),
    ).toThrow(ReferralFeePctExceededError);
  });

  test("behavior/error: in-kind parsing preserves positive-only amounts and owns empty/ordered markets", () => {
    const params = {
      vault,
      args: {
        ...common,
        adapter: zeroAddress,
        amount: 1n,
        marketParamsList: [],
      },
    };
    expect(parseVaultV2InKindRedeem(params).args.marketParamsList).toEqual([]);
    for (const amount of [-1n, 0n])
      expect(() =>
        parseVaultV2InKindRedeem({
          ...params,
          args: { ...params.args, amount },
        }),
      ).toThrow(NonPositiveInputError);
    expect(() =>
      parseVaultV2InKindRedeem({
        ...params,
        args: { ...params.args, amount: maxUint256 + 1n },
      }),
    ).not.toThrow();
    expect(() =>
      parseVaultV2InKindRedeem({
        ...params,
        args: { ...params.args, amount: 0n, deadline: maxUint256 + 1n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      parseVaultV2InKindRedeem({
        ...params,
        args: { ...params.args, deadline: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      parseVaultV2InKindRedeem({
        ...params,
        args: { ...params.args, deadline: maxUint256 + 1n },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(parseDeadline(maxUint256)).toBe(maxUint256);
  });

  test("behavior: force-redeem encoding and metadata use the same owned deallocation snapshot", () => {
    let amountReads = 0;
    const raw = {
      vault,
      args: {
        deallocations: [
          {
            adapter: zeroAddress,
            get amount() {
              return BigInt(++amountReads);
            },
          },
        ],
        redeem: { shares: 1n, recipient: zeroAddress },
        onBehalf: zeroAddress,
      },
    };
    const parsed = parseVaultV2ForceRedeem(raw);
    const first = buildVaultV2ForceRedeem(parsed);
    raw.args.redeem.shares = 2n;
    raw.args.deallocations.length = 0;
    expect(amountReads).toBe(1);
    expect(first.action.args.deallocations[0]!.amount).toBe(1n);
    const multicall = decodeFunctionData({ abi: vaultV2Abi, data: first.data });
    expect(multicall.functionName).toBe("multicall");
    if (multicall.functionName !== "multicall")
      throw new Error("Expected multicall");
    const deallocation = decodeFunctionData({
      abi: vaultV2Abi,
      data: multicall.args[0][0]!,
    });
    expect(deallocation.functionName).toBe("forceDeallocate");
    expect(deallocation.args).toEqual([zeroAddress, "0x", 1n, zeroAddress]);
    expect(buildVaultV2ForceRedeem(parsed)).toEqual(first);
    expect(Object.isFrozen(parsed.args.deallocations[0])).toBe(true);
    expect(Object.isFrozen(first.action.args)).toBe(true);
  });

  test("behavior/error: force-redeem empty list, shares, then deallocation precedence", () => {
    const params = {
      vault,
      args: {
        deallocations: [{ adapter: zeroAddress, amount: 1n }],
        redeem: { shares: 1n, recipient: zeroAddress },
        onBehalf: zeroAddress,
      },
    };
    expect(parseVaultV2ForceRedeem(params).args.deallocations).toEqual(
      params.args.deallocations,
    );
    expect(() =>
      parseVaultV2ForceRedeem({
        ...params,
        args: {
          ...params.args,
          deallocations: [
            { adapter: zeroAddress, amount: maxUint256 + 1n },
            { adapter: zeroAddress, amount: 0n },
          ],
        },
      }),
    ).toThrow(IntegerOutOfRangeError);
    expect(() =>
      parseVaultV2ForceRedeem({
        ...params,
        args: {
          ...params.args,
          deallocations: [],
          redeem: { ...params.args.redeem, shares: 0n },
        },
      }),
    ).toThrow(EmptyDeallocationsError);
    for (const amount of [-1n, 0n]) {
      expect(() =>
        parseVaultV2ForceRedeem({
          ...params,
          args: {
            ...params.args,
            redeem: { ...params.args.redeem, shares: amount },
          },
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        parseVaultV2ForceRedeem({
          ...params,
          args: {
            ...params.args,
            deallocations: [{ adapter: zeroAddress, amount }],
          },
        }),
      ).toThrow(NonPositiveInputError);
    }
  });
});
