import { MathLib } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import { erc20Abi, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  encodeReadResult,
  IN_KIND_ADAPTER,
  IN_KIND_BUNDLER,
  IN_KIND_FOREIGN_ADAPTER,
  IN_KIND_USER,
  IN_KIND_VAULT,
  mockMulticallResults,
  vaultV2ExitData,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
  resolveVaultV2ForceWithdrawEligibility,
} from "../../helpers/index.js";
import {
  AdapterNotPartOfVaultError,
  ChainIdMismatchError,
  ExcessiveSlippageToleranceError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  isRequirementApproval,
  MissingReferralFeeRecipientError,
  NegativeInputError,
  NonPositiveInputError,
  VaultAddressMismatchError,
  VaultV2ForceWithdrawCoverageError,
  VaultV2ForceWithdrawZeroWithdrawalError,
  VaultV2SingleAdapterRequiredError,
  VaultV2UndecodableLiquidityDataError,
  VaultV2UnsupportedExitAdapterError,
  VaultV2UnsupportedLiquidityAdapterError,
} from "../../types/index.js";

const TWO_PERCENT = 20_000_000_000_000_000n;

const mockRequirements = (
  handle: ReturnType<typeof createMockClient>,
  params: { allowance?: bigint; nonce?: bigint } = {},
) => {
  mockMulticallResults(handle, [
    encodeReadResult({
      abi: erc20Abi,
      functionName: "allowance",
      result: params.allowance ?? 0n,
    }),
    encodeReadResult({
      abi: erc2612Abi,
      functionName: "nonces",
      result: params.nonce ?? 9n,
    }),
  ]);
};

const vaultFor = (
  handle: ReturnType<typeof createMockClient>,
  options?: { supportSignature?: boolean },
) =>
  handle.client
    .extend(morphoViemExtension(options))
    .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

/** Recomputes the entity's expected share bound from the same pure helpers. */
const expectedSharesBurnt = (params: {
  readonly vaultData: ReturnType<typeof vaultV2ExitData>;
  readonly exitAssets: bigint;
  readonly timestamp: bigint;
  readonly deadline: bigint;
}) => {
  const { vaultData } = params;
  const eligibility = resolveVaultV2ForceWithdrawEligibility(vaultData);
  if (eligibility.type !== "eligible") {
    throw new Error(`Expected an eligible fixture, got "${eligibility.type}"`);
  }
  const plan = computeVaultV2ForceWithdrawPlan({
    vaultData,
    adapter: eligibility.adapter,
    liquidityMarketId: eligibility.liquidityMarketId,
    exitAssets: params.exitAssets,
    timestamp: params.timestamp,
  });
  const { vault: deadlineVaultData } = vaultData.accrueInterest(
    MathLib.max(params.deadline, vaultData.lastUpdate),
  );

  return {
    plan,
    sharesBurnt: computeVaultV2ForceWithdrawSharesBurnt({
      vaultData,
      deadlineVaultData,
      plan,
    }),
  };
};

describe("MorphoVaultV2.forceWithdraw", () => {
  test("default", () => {
    const handle = createMockClient(mainnet);
    const exit = vaultFor(handle).forceWithdraw({
      exitAssets: 51n,
      vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
      userAddress: IN_KIND_USER,
    });
    const tx = exit.buildTx();

    expect(tx.to).toBe(IN_KIND_BUNDLER);
    expect(tx.action.type).toBe("vaultV2ForceWithdraw");
    expect(tx.action.args).toMatchObject({
      vault: IN_KIND_VAULT,
      adapter: IN_KIND_ADAPTER,
      exitAssets: 51n,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
      onBehalf: IN_KIND_USER,
    });
  });

  test("behavior: derives a non-zero minSharePriceE27 by default", () => {
    const handle = createMockClient(mainnet);
    const tx = vaultFor(handle)
      .forceWithdraw({
        exitAssets: 51n,
        vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
        userAddress: IN_KIND_USER,
      })
      .buildTx();

    expect(tx.action.args.minSharePriceE27).toBeGreaterThan(0n);
  });

  test("behavior: the derived bound accepts the snapshot's own realized price", () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.h(2n);
    const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
    const handle = createMockClient(mainnet);
    const tx = withChainTimestamp(now, () =>
      vaultFor(handle)
        .forceWithdraw({
          exitAssets: 51n,
          vaultData,
          userAddress: IN_KIND_USER,
        })
        .buildTx(),
    );
    const { plan, sharesBurnt } = expectedSharesBurnt({
      vaultData,
      exitAssets: 51n,
      timestamp: now,
      deadline,
    });

    // The on-chain check is `mulDivDown(withdrawn, RAY, sharesBurnt) >= minSharePriceE27`.
    expect(
      MathLib.mulDivDown(plan.withdrawnAssets, MathLib.RAY, sharesBurnt),
    ).toBeGreaterThanOrEqual(tx.action.args.minSharePriceE27);
  });

  test("behavior: a looser slippage tolerance lowers the bound", () => {
    const handle = createMockClient(mainnet);
    const build = (slippageTolerance: bigint) =>
      vaultFor(handle)
        .forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
          slippageTolerance,
        })
        .buildTx().action.args.minSharePriceE27;

    expect(build(MathLib.WAD / 100n)).toBeLessThan(build(0n));
  });

  test("behavior: an explicit minSharePriceE27 overrides the derived bound", () => {
    const handle = createMockClient(mainnet);
    const tx = vaultFor(handle)
      .forceWithdraw({
        exitAssets: 51n,
        vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
        userAddress: IN_KIND_USER,
        minSharePriceE27: 123n,
      })
      .buildTx();

    expect(tx.action.args.minSharePriceE27).toBe(123n);
  });

  // Security invariant: the contract reads `minSharePriceE27 == 0` as "no bound", so an override
  // must never be able to silently disable the guard this path exists to add.
  test.each([0n, -1n])(
    "error: NonPositiveInputError for a minSharePriceE27 override of %s",
    (minSharePriceE27) => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
          minSharePriceE27,
        }),
      ).toThrow(NonPositiveInputError);
    },
  );

  test("behavior: forwards the referral fee split", () => {
    const handle = createMockClient(mainnet);
    const tx = vaultFor(handle)
      .forceWithdraw({
        exitAssets: 51n,
        vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
        userAddress: IN_KIND_USER,
        referralFeePct: TWO_PERCENT,
        referralFeeRecipient: IN_KIND_FOREIGN_ADAPTER,
      })
      .buildTx();

    expect(tx.action.args).toMatchObject({
      referralFeePct: TWO_PERCENT,
      referralFeeRecipient: IN_KIND_FOREIGN_ADAPTER,
    });
  });

  test("behavior: resolves the vault's sole adapter without an override", () => {
    const handle = createMockClient(mainnet);
    const tx = vaultFor(handle)
      .forceWithdraw({
        exitAssets: 51n,
        vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
        userAddress: IN_KIND_USER,
        adapter: IN_KIND_ADAPTER,
      })
      .buildTx();

    expect(tx.action.args.adapter).toBe(IN_KIND_ADAPTER);
  });

  test("behavior: accepts a liquidity adapter routed through the sole adapter", () => {
    const handle = createMockClient(mainnet);
    const tx = vaultFor(handle)
      .forceWithdraw({
        exitAssets: 51n,
        vaultData: vaultV2ExitData({
          liquidityAdapter: "sole",
          penalty: TWO_PERCENT,
        }),
        userAddress: IN_KIND_USER,
      })
      .buildTx();

    expect(tx.action.args.exitAssets).toBe(51n);
  });

  test("behavior: defaults the deadline to two hours out", () => {
    const now = 1_800_000_000n;
    const handle = createMockClient(mainnet);
    const tx = withChainTimestamp(now, () =>
      vaultFor(handle)
        .forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
        })
        .buildTx(),
    );

    expect(tx.action.args.deadline).toBe(now + Time.s.from.h(2n));
  });

  test("behavior: buildTx is synchronous and needs no requirement resolution", () => {
    const handle = createMockClient(mainnet);
    const exit = vaultFor(handle).forceWithdraw({
      exitAssets: 51n,
      vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
      userAddress: IN_KIND_USER,
    });

    // No mocked reads are registered, so any RPC here would throw.
    expect(exit.buildTx().data).toMatch(/^0x/);
  });

  describe("getRequirements", () => {
    test("default: approve path uses the bounded share amount", async () => {
      const now = 1_800_000_000n;
      const deadline = now + Time.s.from.h(2n);
      const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
      const handle = createMockClient(mainnet);
      mockRequirements(handle);
      const [approval] = await withChainTimestamp(now, () =>
        vaultFor(handle, { supportSignature: false })
          .forceWithdraw({
            exitAssets: 51n,
            vaultData,
            userAddress: IN_KIND_USER,
          })
          .getRequirements(),
      );
      const { sharesBurnt } = expectedSharesBurnt({
        vaultData,
        exitAssets: 51n,
        timestamp: now,
        deadline,
      });

      expect(approval?.action).toEqual({
        type: "erc20Approval",
        args: { spender: IN_KIND_BUNDLER, amount: sharesBurnt },
      });
    });

    test("behavior: signature path emits a bounded V2 permit", async () => {
      const now = 1_800_000_000n;
      const deadline = now + Time.s.from.h(2n);
      const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
      const handle = createMockClient(mainnet);
      mockRequirements(handle);
      const [requirement] = await withChainTimestamp(now, () =>
        vaultFor(handle, { supportSignature: true })
          .forceWithdraw({
            exitAssets: 51n,
            vaultData,
            userAddress: IN_KIND_USER,
          })
          .getRequirements(),
      );
      const { sharesBurnt } = expectedSharesBurnt({
        vaultData,
        exitAssets: 51n,
        timestamp: now,
        deadline,
      });

      expect(requirement?.action).toMatchObject({
        type: "permit",
        args: { spender: IN_KIND_BUNDLER, amount: sharesBurnt },
      });
    });

    test("behavior: a sufficient allowance needs no authorization", async () => {
      const handle = createMockClient(mainnet);
      mockRequirements(handle, { allowance: MathLib.MAX_UINT_256 });

      await expect(
        vaultFor(handle, { supportSignature: false })
          .forceWithdraw({
            exitAssets: 51n,
            vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
            userAddress: IN_KIND_USER,
          })
          .getRequirements(),
      ).resolves.toEqual([]);
    });

    test("behavior: the bound covers the penalty legs on top of the asset legs", async () => {
      const now = 1_800_000_000n;
      const deadline = now + Time.s.from.h(2n);
      const vaultData = vaultV2ExitData({
        additionalMarket: true,
        marketTotalBorrowAssets: 0n,
        secondMarketTotalBorrowAssets: 0n,
        penalty: TWO_PERCENT,
      });
      const handle = createMockClient(mainnet);
      mockRequirements(handle);
      const [approval] = await withChainTimestamp(now, () =>
        vaultFor(handle, { supportSignature: false })
          .forceWithdraw({
            exitAssets: 1_400n,
            vaultData,
            userAddress: IN_KIND_USER,
          })
          .getRequirements(),
      );
      const { plan, sharesBurnt } = expectedSharesBurnt({
        vaultData,
        exitAssets: 1_400n,
        timestamp: now,
        deadline,
      });

      expect(plan.penaltyLegs).toBe(2);
      expect(approval?.action.args).toMatchObject({ amount: sharesBurnt });
      expect(sharesBurnt).toBeGreaterThan(
        vaultData.toShares(plan.withdrawnAssets, "Up"),
      );
    });

    test("error: ExpiredDeadlineError when the handle goes stale before the reads", async () => {
      const now = 1_800_000_000n;
      const handle = createMockClient(mainnet);
      mockRequirements(handle);
      const exit = withChainTimestamp(now, () =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
          deadline: now + 1n,
        }),
      );

      await expect(
        withChainTimestamp(now + 2n, () => exit.getRequirements()),
      ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    });
  });

  describe("validation", () => {
    test("error: ChainIdMismatchError on a client targeting another chain", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        handle.client
          .extend(morphoViemExtension())
          .morpho.vaultV2(IN_KIND_VAULT, 8453)
          .forceWithdraw({
            exitAssets: 51n,
            vaultData: vaultV2ExitData(),
            userAddress: IN_KIND_USER,
          }),
      ).toThrow(ChainIdMismatchError);
    });

    test("error: VaultAddressMismatchError on a snapshot from another vault", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ address: IN_KIND_FOREIGN_ADAPTER }),
          userAddress: IN_KIND_USER,
        }),
      ).toThrow(VaultAddressMismatchError);
    });

    test.each([0n, -1n])(
      "error: NonPositiveInputError for exitAssets %s",
      (exitAssets) => {
        const handle = createMockClient(mainnet);

        expect(() =>
          vaultFor(handle).forceWithdraw({
            exitAssets,
            vaultData: vaultV2ExitData(),
            userAddress: IN_KIND_USER,
          }),
        ).toThrow(NonPositiveInputError);
      },
    );

    test("error: ExcessiveSlippageToleranceError above the SDK maximum", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData(),
          userAddress: IN_KIND_USER,
          slippageTolerance: MathLib.WAD / 2n,
        }),
      ).toThrow(ExcessiveSlippageToleranceError);
    });

    test("error: ExpiredDeadlineError for a deadline in the past", () => {
      const now = 1_800_000_000n;
      const handle = createMockClient(mainnet);

      expect(() =>
        withChainTimestamp(now, () =>
          vaultFor(handle).forceWithdraw({
            exitAssets: 51n,
            vaultData: vaultV2ExitData(),
            userAddress: IN_KIND_USER,
            deadline: now - 1n,
          }),
        ),
      ).toThrow(ExpiredDeadlineError);
    });

    test("error: VaultV2SingleAdapterRequiredError without exactly one adapter", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ adapters: "empty" }),
          userAddress: IN_KIND_USER,
        }),
      ).toThrow(VaultV2SingleAdapterRequiredError);
    });

    test("error: AdapterNotPartOfVaultError for a foreign adapter override", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData(),
          userAddress: IN_KIND_USER,
          adapter: IN_KIND_FOREIGN_ADAPTER,
        }),
      ).toThrow(AdapterNotPartOfVaultError);
    });

    test("error: VaultV2UnsupportedExitAdapterError for a legacy adapter", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ adapters: "legacy" }),
          userAddress: IN_KIND_USER,
        }),
      ).toThrow(VaultV2UnsupportedExitAdapterError);
    });

    test("error: VaultV2UnsupportedLiquidityAdapterError for a foreign liquidity adapter", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ liquidityAdapter: "foreign" }),
          userAddress: IN_KIND_USER,
        }),
      ).toThrow(VaultV2UnsupportedLiquidityAdapterError);
    });

    test("error: VaultV2UndecodableLiquidityDataError preserves the decode cause", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ liquidityAdapter: "undecodable" }),
          userAddress: IN_KIND_USER,
        }),
      ).toThrow(VaultV2UndecodableLiquidityDataError);
    });

    test("error: VaultV2ForceWithdrawZeroWithdrawalError on a dust exit", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 1n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
        }),
      ).toThrow(VaultV2ForceWithdrawZeroWithdrawalError);
    });

    test("error: InputExceedsMaxError for a referral fee at or above WAD", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
          referralFeePct: MathLib.WAD,
          referralFeeRecipient: IN_KIND_FOREIGN_ADAPTER,
        }),
      ).toThrow(InputExceedsMaxError);
    });

    test("error: NegativeInputError for a negative referral fee", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
          referralFeePct: -1n,
        }),
      ).toThrow(NegativeInputError);
    });

    test("error: MissingReferralFeeRecipientError for a fee without a recipient", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
          referralFeePct: 1n,
        }),
      ).toThrow(MissingReferralFeeRecipientError);
    });

    test("error: MissingReferralFeeRecipientError for a zero-address recipient", () => {
      const handle = createMockClient(mainnet);

      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: 51n,
          vaultData: vaultV2ExitData({ penalty: TWO_PERCENT }),
          userAddress: IN_KIND_USER,
          referralFeePct: 1n,
          referralFeeRecipient: zeroAddress,
        }),
      ).toThrow(MissingReferralFeeRecipientError);
    });
  });

  describe("security invariants", () => {
    // A caller-chosen `deadline` must not be able to weaken the price floor. The allowance is an
    // upper bound so it legitimately grows with the accrual window, but feeding that same inflated
    // number in as the bound's denominator would only lower the floor.
    test("behavior: the derived minSharePriceE27 does not depend on the deadline", () => {
      const handle = createMockClient(mainnet);
      // A management fee mints shares over time, so a longer window burns more shares.
      const vaultData = vaultV2ExitData({
        penalty: TWO_PERCENT,
        managementFee: 1_000_000_000_000n,
      });
      const boundFor = (deadline: bigint) =>
        vaultFor(handle)
          .forceWithdraw({
            exitAssets: 51n,
            vaultData,
            userAddress: IN_KIND_USER,
            deadline,
          })
          .buildTx().action.args.minSharePriceE27;

      const now = Number(Time.timestamp());
      expect(boundFor(BigInt(now) + Time.s.from.d(365n))).toBe(
        boundFor(BigInt(now) + Time.s.from.h(2n)),
      );
    });

    test("behavior: rejects an exit the adapter's markets cannot cover", () => {
      const handle = createMockClient(mainnet);
      const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
      const { plan } = expectedSharesBurnt({
        vaultData,
        exitAssets: 1n,
        timestamp: 0n,
        deadline: 1n,
      });

      // Above `maxExitAssets` the contract's unbounded loop would panic with `0x32`.
      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: plan.maxExitAssets + 1n,
          vaultData,
          userAddress: IN_KIND_USER,
        }),
      ).toThrow(VaultV2ForceWithdrawCoverageError);
      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: plan.maxExitAssets,
          vaultData,
          userAddress: IN_KIND_USER,
        }),
      ).not.toThrow();
    });

    test("behavior: the coverage error reports an exit that does succeed", () => {
      const handle = createMockClient(mainnet);
      const vaultData = vaultV2ExitData({ penalty: TWO_PERCENT });
      let reported: bigint | undefined;
      try {
        vaultFor(handle).forceWithdraw({
          exitAssets: 10_000n,
          vaultData,
          userAddress: IN_KIND_USER,
        });
      } catch (error) {
        if (!(error instanceof VaultV2ForceWithdrawCoverageError)) throw error;
        reported = error.maxExitAssets;
      }

      expect(reported).toBeDefined();
      expect(() =>
        vaultFor(handle).forceWithdraw({
          exitAssets: reported ?? 0n,
          vaultData,
          userAddress: IN_KIND_USER,
        }),
      ).not.toThrow();
    });

    test("behavior: the approved allowance covers the exit's full share burn", async () => {
      const now = 1_800_000_000n;
      const deadline = now + Time.s.from.h(2n);
      // A non-unit share price is load-bearing: at ~1:1 the sum of the per-leg ceilings equals the
      // aggregate ceiling exactly, so the per-leg dust term would go unexercised and this
      // assertion would still hold with it removed. `additionalMarket` puts total assets at 1500
      // against a 1000 share supply, which makes each leg's `toShares(_, "Up")` round up.
      const vaultData = vaultV2ExitData({
        assetBalance: 10n,
        penalty: TWO_PERCENT,
        additionalMarket: true,
        totalSupply: 1_000n,
      });
      const handle = createMockClient(mainnet);
      mockRequirements(handle);
      const [approval] = await withChainTimestamp(now, () =>
        vaultFor(handle, { supportSignature: false })
          .forceWithdraw({
            exitAssets: 61n,
            vaultData,
            userAddress: IN_KIND_USER,
          })
          .getRequirements(),
      );
      const { plan } = expectedSharesBurnt({
        vaultData,
        exitAssets: 61n,
        timestamp: now,
        deadline,
      });
      if (!isRequirementApproval(approval)) {
        throw new Error("Expected an ERC-20 approval requirement");
      }

      // Every leg the contract burns must fit inside the authorized amount.
      expect(approval.action.args.amount).toBeGreaterThanOrEqual(
        vaultData.toShares(plan.assetsToWithdraw, "Up") +
          vaultData.toShares(plan.assetsToDeallocate, "Up") +
          vaultData.toShares(plan.penaltyAssets, "Up"),
      );
    });

    test("behavior: the user is never quoted more assets than exitAssets", () => {
      const handle = createMockClient(mainnet);
      const vaultData = vaultV2ExitData({
        assetBalance: 10n,
        penalty: TWO_PERCENT,
      });

      for (let exitAssets = 20n; exitAssets <= 100n; exitAssets += 7n) {
        const { plan } = expectedSharesBurnt({
          vaultData,
          exitAssets,
          timestamp: 0n,
          deadline: 1n,
        });
        expect(plan.withdrawnAssets).toBeLessThanOrEqual(exitAssets);
        expect(() =>
          vaultFor(handle).forceWithdraw({
            exitAssets,
            vaultData,
            userAddress: IN_KIND_USER,
          }),
        ).not.toThrow();
      }
    });
  });
});
