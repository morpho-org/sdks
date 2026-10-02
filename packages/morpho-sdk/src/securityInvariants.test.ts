/**
 * Executable checks for the "Security invariants" table in the repository's SECURITY.md.
 * Each `describe` is tagged with the invariant ID it covers; `pnpm lint:security-invariants`
 * fails when an ID in SECURITY.md has no tagged test here (or anywhere under `packages/`).
 */
import {
  AccrualPosition,
  type AccrualVault,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
  Token,
} from "@morpho-org/blue-sdk";
import { addressesRegistry } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import fc from "fast-check";
import {
  type Address,
  createWalletClient,
  custom,
  decodeFunctionData,
  isAddressEqual,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { WethUsdsBlue } from "../test/fixtures/blue.js";
import { vaultBundlesV1Abi } from "./abis.js";
import {
  blueBorrow,
  blueRefinance,
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateral,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  blueWithdrawCollateral,
} from "./actions/blue/index.js";
import { encodeBlueSignatureAuthorization } from "./actions/requirements/encode/encodeBlueSignatureAuthorization.js";
import { encodeErc20Approval } from "./actions/requirements/encode/encodeErc20Approval.js";
import { encodeErc20Permit } from "./actions/requirements/encode/encodeErc20Permit.js";
import { encodeErc20Permit2SignatureTransfer } from "./actions/requirements/encode/encodeErc20Permit2SignatureTransfer.js";
import { encodeVaultSharesPermit } from "./actions/requirements/encode/encodeVaultSharesPermit.js";
import {
  vaultV1Deposit,
  vaultV1InKindRedeem,
  vaultV1MigrateToV2,
  vaultV1Redeem,
  vaultV1Withdraw,
} from "./actions/vaultV1/index.js";
import {
  vaultV2Deposit,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "./actions/vaultV2/index.js";
import { morphoViemExtension } from "./client/index.js";
import {
  DEFAULT_LLTV_BUFFER,
  MAX_ABSOLUTE_SHARE_PRICE,
  MAX_SLIPPAGE_TOLERANCE,
} from "./helpers/constant.js";
import { signAndVerifyTypedData } from "./helpers/signAndVerifyTypedData.js";
import { computeVaultMaxSharePrice } from "./helpers/slippage.js";
import {
  validateChainId,
  validateDeadline,
  validateMidnightMarketChainId,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateRepayAmount,
  validateRepayShares,
  validateSlippageTolerance,
  validateUint256Field,
  validateWithdrawAmount,
  validateWithdrawShares,
} from "./helpers/validate.js";
import {
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  ExcessiveSlippageToleranceError,
  InputExceedsMaxError,
  InvalidSignatureError,
  NegativeInputError,
  NonPositiveInputError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  UnsupportedAuthorizationOperatorError,
  UnsupportedErc20ApprovalSpenderError,
  WithdrawExceedsSupplyError,
  WithdrawMakesPositionUnhealthyError,
  WithdrawSharesExceedSupplyError,
} from "./types/index.js";

const userAddress: Address = "0x00000000000000000000000000000000000000A1";
const vaultAddress: Address = "0x00000000000000000000000000000000000000A2";
const assetAddress: Address = "0x00000000000000000000000000000000000000A3";
const deadline = 1_900_000_000n;
const marketParams = new MarketParams(WethUsdsBlue);
const destinationMarketParams = new MarketParams({
  ...WethUsdsBlue,
  oracle: "0x00000000000000000000000000000000000000a4",
});
const adapter: Address = "0x00000000000000000000000000000000000000A5";

type RegistryEntry = {
  readonly bundles?: {
    readonly vaultBundlesV1?: Address;
    readonly vaultExitBundlesV1?: Address;
    readonly blueBundlesV1?: Address;
  };
} & Record<string, unknown>;

const registry = Object.entries(
  addressesRegistry as unknown as Record<string, RegistryEntry>,
).map(([chainId, addresses]) => ({ chainId: Number(chainId), addresses }));

const vaultChains = registry.flatMap(({ chainId, addresses }) =>
  addresses.bundles?.vaultBundlesV1 == null
    ? []
    : [{ chainId, periphery: addresses.bundles.vaultBundlesV1 }],
);
const vaultExitChains = registry.flatMap(({ chainId, addresses }) =>
  addresses.bundles?.vaultExitBundlesV1 == null
    ? []
    : [{ chainId, periphery: addresses.bundles.vaultExitBundlesV1 }],
);
const blueChains = registry.flatMap(({ chainId, addresses }) =>
  addresses.bundles?.blueBundlesV1 == null
    ? []
    : [{ chainId, periphery: addresses.bundles.blueBundlesV1 }],
);

/** A 1:1 market (assets == shares, price == 1) so position amounts are easy to reason about. */
const makePosition = (position: {
  supplyShares?: bigint;
  borrowShares?: bigint;
  collateral?: bigint;
}) =>
  new AccrualPosition(
    {
      user: userAddress,
      supplyShares: position.supplyShares ?? 0n,
      borrowShares: position.borrowShares ?? 0n,
      collateral: position.collateral ?? 0n,
    },
    new Market({
      params: marketParams,
      totalSupplyAssets: 10n ** 30n,
      totalBorrowAssets: 10n ** 29n,
      totalSupplyShares: 10n ** 30n,
      totalBorrowShares: 10n ** 29n,
      lastUpdate: 1_700_000_000n,
      fee: 0n,
      price: ORACLE_PRICE_SCALE,
    }),
  );

describe("[INV-01] Deposit routing", () => {
  test("vault deposit, withdraw and redeem target VaultBundlesV1 on every registered chain", () => {
    expect(vaultChains.length).toBeGreaterThan(0);
    for (const { chainId, periphery } of vaultChains) {
      const vault = { chainId, address: vaultAddress, asset: assetAddress };
      const transactions = [
        vaultV1Deposit({
          vault,
          args: {
            amount: 1n,
            maxSharePrice: MathLib.RAY,
            userAddress,
            deadline,
          },
        }),
        vaultV2Deposit({
          vault,
          args: {
            amount: 1n,
            maxSharePrice: MathLib.RAY,
            userAddress,
            deadline,
          },
        }),
        vaultV1Withdraw({ vault, args: { amount: 1n, userAddress, deadline } }),
        vaultV2Withdraw({ vault, args: { amount: 1n, userAddress, deadline } }),
        vaultV1Redeem({ vault, args: { shares: 1n, userAddress, deadline } }),
        vaultV2Redeem({ vault, args: { shares: 1n, userAddress, deadline } }),
        vaultV1MigrateToV2({
          vault,
          args: {
            assets: 1n,
            targetVault: adapter,
            targetAsset: assetAddress,
            maxSharePriceVaultV2: MathLib.RAY,
            userAddress,
            deadline,
          },
        }),
      ];
      for (const transaction of transactions) {
        expect(transaction.to, `chain ${chainId}`).toBe(periphery);
        expect(isAddressEqual(transaction.to, vaultAddress)).toBe(false);
      }
    }
  });

  test("vault in-kind redeem and force-withdraw target VaultExitBundlesV1 on every registered chain", () => {
    expect(vaultExitChains.length).toBeGreaterThan(0);
    for (const { chainId, periphery } of vaultExitChains) {
      const vault = { chainId, address: vaultAddress };
      const transactions = [
        vaultV1InKindRedeem({
          vault,
          args: {
            amount: 1n,
            marketParamsList: [marketParams],
            userAddress,
            deadline,
          },
        }),
        vaultV2InKindRedeem({
          vault,
          args: {
            adapter,
            amount: 1n,
            marketParamsList: [marketParams],
            userAddress,
            deadline,
          },
        }),
        vaultV2ForceWithdraw({
          vault,
          args: {
            adapter,
            exitAssets: 1n,
            minSharePriceE27: 1n,
            userAddress,
            deadline,
          },
        }),
      ];
      for (const transaction of transactions) {
        expect(transaction.to, `chain ${chainId}`).toBe(periphery);
      }
    }
  });

  test("Blue writes target BlueBundlesV1 on every registered chain", () => {
    expect(blueChains.length).toBeGreaterThan(0);
    for (const { chainId, periphery } of blueChains) {
      const market = { chainId, marketParams };
      const transactions = [
        blueSupply({ market, args: { userAddress, assets: 1n, deadline } }),
        blueSupplyCollateralBorrow({
          market,
          args: {
            userAddress,
            collateralAssets: 1n,
            borrowAssets: 1n,
            maxLtv: 0n,
            deadline,
          },
        }),
        blueRepayWithdrawCollateral({
          market,
          args: {
            userAddress,
            repayAssets: 1n,
            repayShares: 0n,
            maxRepayAssets: 1n,
            collateralAssets: 1n,
            maxLtv: 0n,
            deadline,
          },
        }),
        blueRefinance({
          market: {
            chainId,
            sourceMarketParams: marketParams,
            destinationMarketParams,
          },
          args: { userAddress, maxLtv: 0n, deadline },
        }),
        blueSupplyCollateral({
          market,
          args: { userAddress, collateralAssets: 1n, deadline },
        }),
        blueBorrow({
          market,
          args: { userAddress, borrowAssets: 1n, maxLtv: 0n, deadline },
        }),
        blueRepay({
          market,
          args: {
            userAddress,
            repayAssets: 1n,
            repayShares: 0n,
            maxRepayAssets: 1n,
            deadline,
          },
        }),
        blueWithdraw({
          market,
          args: {
            userAddress,
            withdrawAssets: 1n,
            withdrawShares: 0n,
            deadline,
          },
        }),
        blueWithdrawCollateral({
          market,
          args: { userAddress, collateralAssets: 1n, maxLtv: 0n, deadline },
        }),
      ];
      for (const transaction of transactions) {
        expect(transaction.to, `chain ${chainId}`).toBe(periphery);
      }
    }
  });
});

describe("[INV-02] Inflation-attack guard", () => {
  const vaultAt = (sharesPerAsset: bigint) => {
    const toShares = (assets: bigint) => assets * sharesPerAsset;
    return {
      toShares,
      accrueInterest: () => ({ toShares }),
    } as unknown as AccrualVault;
  };

  test("the max share price is the previewed price plus at most the bounded tolerance", () => {
    fc.assert(
      fc.property(
        fc.record({
          assets: fc.bigInt({ min: 1n, max: 10n ** 30n }),
          sharesPerAsset: fc.bigInt({ min: 1n, max: 10n ** 6n }),
          slippageTolerance: fc.bigInt({
            min: 0n,
            max: MAX_SLIPPAGE_TOLERANCE,
          }),
        }),
        ({ assets, sharesPerAsset, slippageTolerance }) => {
          const shares = assets * sharesPerAsset;
          const maxSharePrice = computeVaultMaxSharePrice({
            vaultData: vaultAt(sharesPerAsset),
            deadline,
            assets,
            slippageTolerance,
          });
          const ceiling = MathLib.mulDivUp(
            assets,
            MathLib.wToRay(MathLib.WAD + MAX_SLIPPAGE_TOLERANCE),
            shares,
          );
          expect(maxSharePrice).toBeLessThanOrEqual(ceiling);
          expect(maxSharePrice).toBeLessThanOrEqual(MAX_ABSOLUTE_SHARE_PRICE);
          expect(maxSharePrice).toBeGreaterThanOrEqual(
            MathLib.min(
              MathLib.mulDivDown(assets, MathLib.RAY, shares),
              MAX_ABSOLUTE_SHARE_PRICE,
            ),
          );
        },
      ),
    );
  });

  test("the share price is capped by MAX_ABSOLUTE_SHARE_PRICE", () => {
    expect(MAX_ABSOLUTE_SHARE_PRICE).toBe(100n * MathLib.RAY);
    expect(
      computeVaultMaxSharePrice({
        vaultData: {
          toShares: () => 1n,
          accrueInterest: () => ({ toShares: () => 1n }),
        } as unknown as AccrualVault,
        deadline,
        assets: 10n ** 30n,
        slippageTolerance: 0n,
      }),
    ).toBe(MAX_ABSOLUTE_SHARE_PRICE);
  });

  test("an excessive tolerance is rejected", () => {
    expect(() =>
      computeVaultMaxSharePrice({
        vaultData: vaultAt(1n),
        deadline,
        assets: 1n,
        slippageTolerance: MAX_SLIPPAGE_TOLERANCE + 1n,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });

  test("deposits carry the max share price into the periphery calldata", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: maxUint256 }), (maxSharePrice) => {
        for (const deposit of [vaultV1Deposit, vaultV2Deposit]) {
          const transaction = deposit({
            vault: {
              chainId: mainnet.id,
              address: vaultAddress,
              asset: assetAddress,
            },
            args: { amount: 1n, maxSharePrice, userAddress, deadline },
          });
          const { args } = decodeFunctionData({
            abi: vaultBundlesV1Abi,
            data: transaction.data,
          });
          expect(args).toContain(maxSharePrice);
        }
      }),
    );
  });
});

describe("[INV-03] LLTV buffer", () => {
  const collateral = 10n ** 24n;
  const { lltv } = marketParams;
  const safeLtv = lltv - DEFAULT_LLTV_BUFFER;

  test("the buffer is fixed at 0.5%", () => {
    expect(DEFAULT_LLTV_BUFFER).toBe(MathLib.WAD / 200n);
  });

  test("a borrow landing between LLTV - buffer and LLTV is rejected", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: safeLtv + 1n, max: lltv }), (targetLtv) => {
        expect(() =>
          validatePositionHealth({
            positionData: makePosition({ collateral }),
            additionalCollateral: 0n,
            borrowAmount: MathLib.wMulDown(collateral, targetLtv),
            marketId: marketParams.id,
            lltv,
          }),
        ).toThrow(BorrowExceedsSafeLtvError);
      }),
    );
  });

  test("a borrow at the buffered LTV is accepted", () => {
    expect(() =>
      validatePositionHealth({
        positionData: makePosition({ collateral }),
        additionalCollateral: 0n,
        borrowAmount: MathLib.wMulDown(collateral, safeLtv) - 1n,
        marketId: marketParams.id,
        lltv,
      }),
    ).not.toThrow();
  });

  test("a collateral withdrawal landing between LLTV - buffer and LLTV is rejected", () => {
    const debt = 10n ** 20n;
    fc.assert(
      fc.property(fc.bigInt({ min: safeLtv + 1n, max: lltv }), (targetLtv) => {
        const positionData = makePosition({ collateral, borrowShares: debt });
        const remaining = MathLib.wDivDown(
          positionData.borrowAssets,
          targetLtv,
        );
        expect(() =>
          validatePositionHealthAfterWithdraw({
            positionData,
            withdrawAmount: collateral - remaining,
            lltv,
            marketId: marketParams.id,
          }),
        ).toThrow(WithdrawMakesPositionUnhealthyError);
      }),
    );
  });
});

describe("[INV-04] Bounded slippage", () => {
  test("MAX_SLIPPAGE_TOLERANCE is 10%", () => {
    expect(MAX_SLIPPAGE_TOLERANCE).toBe(MathLib.WAD / 10n);
  });

  test("tolerances in [0, MAX_SLIPPAGE_TOLERANCE] are accepted", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX_SLIPPAGE_TOLERANCE }),
        (tolerance) => {
          expect(() => validateSlippageTolerance(tolerance)).not.toThrow();
        },
      ),
    );
  });

  test("negative or excessive tolerances are rejected", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -maxUint256, max: -1n }), (tolerance) => {
        expect(() => validateSlippageTolerance(tolerance)).toThrow(
          NegativeInputError,
        );
      }),
    );
    fc.assert(
      fc.property(
        fc.bigInt({ min: MAX_SLIPPAGE_TOLERANCE + 1n, max: maxUint256 }),
        (tolerance) => {
          expect(() => validateSlippageTolerance(tolerance)).toThrow(
            ExcessiveSlippageToleranceError,
          );
        },
      ),
    );
  });
});

describe("[INV-05] chainId validation", () => {
  const chainIds = registry.map(({ chainId }) => chainId);

  test("every pair of distinct registered chains is rejected", () => {
    for (const expected of chainIds) {
      expect(() => validateChainId(expected, expected)).not.toThrow();
      expect(() => validateChainId(undefined, expected)).toThrow(
        ChainIdMismatchError,
      );
      for (const actual of chainIds) {
        if (actual === expected) continue;
        expect(() => validateChainId(actual, expected)).toThrow(
          ChainIdMismatchError,
        );
        expect(() =>
          validateMidnightMarketChainId(
            { chainId: BigInt(actual) } as never,
            expected,
          ),
        ).toThrow(ChainIdMismatchError);
      }
    }
  });

  test("entities refuse to read for a client on another chain", async () => {
    const morpho = createMockClient(mainnet).client.extend(
      morphoViemExtension(),
    ).morpho;

    await expect(
      morpho.vaultV1(vaultAddress, base.id).getData(),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    await expect(
      morpho.vaultV2(vaultAddress, base.id).getData(),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    await expect(
      morpho.blue(marketParams, base.id).getMarketData(),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("typed-data signing refuses a domain for another chain", async () => {
    const account = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
    const client = createWalletClient({
      account,
      chain: base,
      transport: custom({ request: async () => "0x" }),
    });
    await expect(
      signAndVerifyTypedData({
        client,
        userAddress: account.address,
        typedData: {
          domain: { chainId: mainnet.id },
          types: { Message: [{ name: "value", type: "uint256" }] },
          primaryType: "Message",
          message: { value: 1n },
        },
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
});

describe("[INV-06] Authorization", () => {
  const unregisteredSpender = (addresses: unknown) => {
    const registered = JSON.stringify(addresses).toLowerCase();
    return fc
      .uint8Array({ minLength: 20, maxLength: 20 })
      .map((bytes) => `0x${Buffer.from(bytes).toString("hex")}` as Address)
      .filter((spender) => !registered.includes(spender.slice(2)));
  };

  test("approvals to an unregistered spender are rejected on every registered chain", () => {
    for (const { chainId, addresses } of registry) {
      fc.assert(
        fc.property(unregisteredSpender(addresses), (spender) => {
          expect(() =>
            encodeErc20Approval({
              token: assetAddress,
              spender,
              amount: 1n,
              chainId,
            }),
          ).toThrow(UnsupportedErc20ApprovalSpenderError);
        }),
        { numRuns: 20 },
      );
    }
    for (const { chainId, periphery } of blueChains) {
      expect(() =>
        encodeErc20Approval({
          token: assetAddress,
          spender: periphery,
          amount: 1n,
          chainId,
        }),
      ).not.toThrow();
    }
  });

  test("permits and Morpho authorizations to an unregistered spender are rejected", async () => {
    const { client } = createMockClient(mainnet);
    const addresses = registry.find(
      ({ chainId }) => chainId === mainnet.id,
    )?.addresses;
    await fc.assert(
      fc.asyncProperty(unregisteredSpender(addresses), async (spender) => {
        const common = { chainId: mainnet.id, nonce: 0n, amount: 1n, deadline };
        expect(() =>
          encodeErc20Permit2SignatureTransfer({
            ...common,
            token: assetAddress,
            spender,
          }),
        ).toThrow(UnsupportedErc20ApprovalSpenderError);
        expect(() =>
          encodeVaultSharesPermit({
            ...common,
            vault: new Token({ address: vaultAddress, name: "Vault" }),
            version: "vaultV2",
            owner: userAddress,
            spender,
          }),
        ).toThrow(UnsupportedErc20ApprovalSpenderError);
        await expect(
          encodeErc20Permit(client, {
            ...common,
            token: assetAddress,
            owner: userAddress,
            spender,
          }),
        ).rejects.toBeInstanceOf(UnsupportedErc20ApprovalSpenderError);
        await expect(
          encodeBlueSignatureAuthorization(client, {
            chainId: mainnet.id,
            nonce: 0n,
            owner: userAddress,
            authorized: spender,
          }),
        ).rejects.toBeInstanceOf(UnsupportedAuthorizationOperatorError);
      }),
      { numRuns: 20 },
    );
  });

  test("a signature from another account than userAddress is rejected", async () => {
    const user = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
    const other = privateKeyToAccount(`0x${"02".padStart(64, "0")}`);
    const client = createWalletClient({
      account: user.address,
      chain: mainnet,
      transport: custom({
        request: async ({ method, params }) => {
          if (method === "eth_signTypedData_v4" && Array.isArray(params))
            return other.signTypedData(JSON.parse(params[1] as string));
          throw new Error(`Unexpected RPC request "${method}".`);
        },
      }),
    });
    await expect(
      signAndVerifyTypedData({
        client,
        userAddress: user.address,
        typedData: {
          domain: { chainId: mainnet.id },
          types: { Message: [{ name: "value", type: "uint256" }] },
          primaryType: "Message",
          message: { value: 1n },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("[INV-07] Accounting", () => {
  const marketId = marketParams.id;
  const amount = fc.bigInt({ min: 0n, max: 10n ** 30n });

  test("withdrawals never exceed the supplied position", () => {
    fc.assert(
      fc.property(amount, amount, (supplyShares, requested) => {
        const positionData = makePosition({ supplyShares });
        const withdrawAssets = () =>
          validateWithdrawAmount({
            positionData,
            withdrawAssets: requested,
            marketId,
          });
        const withdrawShares = () =>
          validateWithdrawShares({
            positionData,
            withdrawShares: requested,
            marketId,
          });
        if (requested > positionData.supplyAssets)
          expect(withdrawAssets).toThrow(WithdrawExceedsSupplyError);
        else expect(withdrawAssets).not.toThrow();
        if (requested > positionData.supplyShares)
          expect(withdrawShares).toThrow(WithdrawSharesExceedSupplyError);
        else expect(withdrawShares).not.toThrow();
      }),
    );
  });

  test("repayments never exceed the debt", () => {
    fc.assert(
      fc.property(amount, amount, (borrowShares, requested) => {
        const positionData = makePosition({
          borrowShares,
          collateral: 10n ** 32n,
        });
        const repayAssets = () =>
          validateRepayAmount({
            positionData,
            repayAssets: requested,
            marketId,
          });
        const repayShares = () =>
          validateRepayShares({
            positionData,
            repayShares: requested,
            marketId,
          });
        if (requested > positionData.borrowAssets)
          expect(repayAssets).toThrow(RepayExceedsDebtError);
        else expect(repayAssets).not.toThrow();
        if (requested > positionData.borrowShares)
          expect(repayShares).toThrow(RepaySharesExceedDebtError);
        else expect(repayShares).not.toThrow();
      }),
    );
  });

  test("amounts fit in uint256 and deadlines are positive", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: maxUint256 }), (value) => {
        expect(() => validateUint256Field("amount", value)).not.toThrow();
      }),
    );
    expect(() => validateUint256Field("amount", maxUint256 + 1n)).toThrow(
      InputExceedsMaxError,
    );
    expect(() => validateUint256Field("amount", -1n)).toThrow(
      NegativeInputError,
    );
    expect(() => validateDeadline(0n)).toThrow(NonPositiveInputError);
    expect(() => validateDeadline(maxUint256 + 1n)).toThrow(
      InputExceedsMaxError,
    );
    expect(() => validateDeadline(1n)).not.toThrow();
  });
});
