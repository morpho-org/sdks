import type { Address, Hex } from "viem";

type ReferralFee = {
  /** Requested rate in basis points; encoded fees must not exceed this or `max_fee_bps`. */
  readonly bps: number;
  readonly recipient: Address;
};

type Funding =
  | { readonly type: "erc20" }
  | {
      readonly type: "native" | "auto";
      readonly max_native_assets: string;
    };

type Amount<U extends "assets" | "shares" | "units"> = {
  readonly unit: U;
  readonly value: string;
};

type All = { readonly unit: "all" };

interface CommonIntent {
  readonly chain_id: number;
  readonly account: Address;
  readonly max_fee_bps: number;
  readonly calldata_origin?: Hex;
}

interface VaultIntent extends CommonIntent {
  readonly vault: Address;
  /** Trusted underlying token. The verifier checks encoded token addresses but does not read `vault.asset()`. */
  readonly asset: Address;
}

interface PreparedIntent extends CommonIntent {
  readonly expires_at?: number;
  readonly signature_mode?: "none" | "auto";
}

type PreparedVaultIntent = PreparedIntent & VaultIntent;

type Deposit<A> = PreparedVaultIntent & {
  readonly action: A;
  readonly amount: Amount<"assets">;
  readonly funding: Funding;
  readonly referral_fee?: ReferralFee;
  /**
   * The verifier rejects zero and uint256-max deposit share-price ceilings but
   * does not check this tolerance. To enforce it, require decoded `args[2]` to
   * be at most a RAY-scaled ceiling derived from pinned vault data using the
   * SDK's fee-net assets and share previews rounded down. Use a projection
   * deadline from your original request or local policy, not the API response,
   * and reject decoded `args[6]` if it is later than that deadline.
   */
  readonly slippage_bps?: number;
};

type Withdraw<A> = PreparedVaultIntent & {
  readonly action: A;
  readonly referral_fee?: ReferralFee;
} & (
    | { readonly amount: Amount<"assets">; readonly slippage_bps?: number }
    | { readonly amount: Amount<"shares"> | All; readonly slippage_bps?: never }
  );

type ForceWithdraw =
  | (PreparedVaultIntent & {
      readonly action: "vault_v2.force_withdraw";
      readonly amount: Amount<"assets">;
      readonly referral_fee?: ReferralFee;
      /**
       * The verifier rejects a zero force-withdraw share-price floor but does not
       * check this tolerance. To enforce it, require decoded `args[3]` to be at
       * least the RAY-scaled `action.args.minSharePriceE27` from the public
       * Morpho SDK vault's `forceWithdraw(...).buildTx()`. Set
       * `slippage_bps` explicitly in your request instead of relying on a
       * default, and pass `BigInt(slippage_bps) * 10n ** 14n` as the SDK's
       * WAD-scaled `slippageTolerance`. Use pinned vault data and a deadline
       * from your request or local policy; reject a later decoded `args[7]`.
       * The SDK accounts for penalties and fee
       * shares minted to the signer, which reduce the net burn. The bundle
       * skips its floor check when `totalSharesBurnt == 0`.
       */
      readonly slippage_bps?: number;
      readonly max_penalty_bps?: never;
    })
  | (VaultIntent & {
      readonly action: "vault_v2.force_withdraw";
      /** Checks deallocation structure, account and positive amounts; simulation must bound their total using the onchain position and share price. */
      readonly amount: All;
      /**
       * Penalty cap in basis points; not checked by the verifier. Before signing,
       * read the vault's WAD-scaled `forceDeallocatePenalty(adapter)` at a pinned
       * block for each verified deallocation adapter and require
       * `penalty <= BigInt(max_penalty_bps) * 10n ** 14n`.
       * Simulation can separately bound penalty assets and market deallocations.
       * If a leg emits no matching Blue `Withdraw` event (for example, a Vault V1
       * adapter or a non-Blue leg with empty adapter data), simulation fails closed
       * when `quote.deallocations` is supplied; use `quote.penalty` to bound the
       * penalty cost across all legs, or derive your own per-leg limits.
       */
      readonly max_penalty_bps: number;
      readonly expires_at?: never;
      readonly signature_mode?: never;
      readonly referral_fee?: never;
      readonly slippage_bps?: never;
    });

type InKindRedeem = PreparedVaultIntent & {
  readonly action: "vault_v2.redeem_in_kind";
  readonly amount: Amount<"assets">;
  readonly market: `${number}:${Hex}`;
  /**
   * Optional Actions API penalty cap in basis points; not checked by the verifier.
   * For in-kind redemption, evm-simulation rejects `quote.penalty`.
   * If `max_penalty_bps !== undefined`, read the vault's WAD-scaled
   * `forceDeallocatePenalty(adapter)` at a pinned block before signing and
   * require `penalty <= BigInt(max_penalty_bps) * 10n ** 14n`.
   * Skip the comparison if omitted; a cap of `0` requires zero penalty.
   * Minimum `quote.positions` or `quote.assetsReceived` bounds check proceeds, not the rate;
   * `quote.assetsReceived` measures only idle assets paid to the wallet.
   */
  readonly max_penalty_bps?: number;
};

/** @internal */
export type VaultCalldataIntent =
  | Deposit<"vault_v1.deposit">
  | Deposit<"vault_v2.deposit">
  | Withdraw<"vault_v1.withdraw">
  | Withdraw<"vault_v2.withdraw">
  | ForceWithdraw
  | InKindRedeem;

type MarketSelector = `${number}:${Hex}`;
type MarketAmount = Amount<"assets" | "shares"> | All;
type BlueMarketIntent = PreparedIntent & { readonly market: Hex };
type WithFunding = { readonly funding: Funding };
type WithReferral = { readonly referral_fee?: ReferralFee };
type WithAmount<A extends MarketAmount> = { readonly amount: A };
type WithCollateralAmount = { readonly collateral_amount: Amount<"assets"> };

/** @internal */
export type BlueCalldataIntent = BlueMarketIntent &
  (
    | ({ readonly action: "blue.supply" } & WithAmount<Amount<"assets">> &
        WithFunding &
        WithReferral)
    | ({ readonly action: "blue.withdraw" } & WithAmount<MarketAmount> &
        WithReferral)
    | ({ readonly action: "blue.supply_collateral" } & WithAmount<
        Amount<"assets">
      > &
        WithFunding)
    | ({ readonly action: "blue.withdraw_collateral" } & WithAmount<
        Amount<"assets">
      >)
    | ({ readonly action: "blue.borrow" } & WithAmount<Amount<"assets">> &
        WithReferral &
        (
          | { readonly collateral_amount?: never; readonly funding?: never }
          | (WithCollateralAmount & WithFunding)
        ))
    | ({ readonly action: "blue.repay" } & WithAmount<MarketAmount> &
        WithFunding &
        WithReferral &
        Partial<WithCollateralAmount>)
    | ({
        readonly action: "blue.refinance";
        readonly destination_market: MarketSelector;
      } & WithReferral)
  );

type MidnightAmount = Amount<"assets" | "units">;
type MidnightCollateral<A> = {
  readonly collateral: { readonly address: Address };
  readonly amount: A;
};
type MidnightBuyGuard =
  | { readonly type: "slippage"; readonly bps: number }
  | {
      readonly type: "min_units" | "max_assets" | "min_rate";
      readonly value: string;
    };
type MidnightSellGuard =
  | { readonly type: "slippage"; readonly bps: number }
  | {
      readonly type: "max_units" | "min_assets" | "max_rate";
      readonly value: string;
    };
type MidnightMarketParams = {
  readonly loan_token: Address;
  readonly maturity: number;
  readonly rcf_threshold: string;
  readonly enter_gate: Address;
  readonly liquidator_gate: Address;
  readonly collaterals: readonly {
    readonly token: Address;
    readonly lltv: string;
    readonly liquidation_cursor: string;
    readonly oracle: Address;
  }[];
};
type MidnightMarket = CommonIntent & {
  readonly market: Hex;
  readonly expires_at?: number;
};
type MidnightWithdrawals = {
  readonly collateral_withdrawals: readonly MidnightCollateral<
    Amount<"assets"> | All
  >[];
};

/** @internal */
export type MidnightMarketIntent = MidnightMarket &
  (
    | ({
        readonly action: "midnight.borrow";
        readonly amount: MidnightAmount;
        readonly guard?: MidnightSellGuard;
        readonly market_params?: MidnightMarketParams;
      } & WithReferral &
        (
          | { readonly collateral_supplies?: never; readonly funding?: never }
          | (WithFunding & {
              readonly collateral_supplies: readonly MidnightCollateral<
                Amount<"assets">
              >[];
            })
        ))
    | ({
        readonly action: "midnight.lend";
        readonly amount: MidnightAmount;
        readonly guard?: MidnightBuyGuard;
        readonly market_params?: MidnightMarketParams;
      } & WithFunding &
        WithReferral)
    | ({
        readonly action: "midnight.repay";
        readonly type: "direct";
        readonly amount: Amount<"assets"> | All;
      } & WithFunding &
        Partial<MidnightWithdrawals>)
    | ({
        readonly action: "midnight.market_repay";
        readonly type: "market";
        readonly amount: MidnightAmount;
        readonly guard?: MidnightBuyGuard;
      } & WithFunding &
        Partial<MidnightWithdrawals>)
    | ({ readonly action: "midnight.withdraw" | "midnight.redeem" } & (
        | (WithReferral & {
            readonly amount: MidnightAmount;
            readonly guard?: MidnightSellGuard;
            readonly allow_partial?: never;
          })
        | {
            readonly amount: All;
            readonly allow_partial?: boolean;
            readonly guard?: never;
            readonly referral_fee?: never;
          }
      ))
    | ({ readonly action: "midnight.supply_collateral" } & MidnightCollateral<
        Amount<"assets">
      >)
    | ({
        readonly action: "midnight.withdraw_collateral";
      } & MidnightWithdrawals)
  );

type MidnightOfferRequest = CommonIntent & {
  readonly expires_at?: number;
  readonly p2p?: boolean;
};

type MidnightOfferEntry = {
  readonly market_id: Hex;
  readonly starts_at: number;
  readonly expires_at: number;
};

type MidnightMakerRequest = MidnightOfferRequest & {
  readonly offers:
    | {
        readonly type: "price";
        readonly entries: readonly (MidnightOfferEntry & {
          readonly tick: string;
        })[];
      }
    | {
        readonly type: "rate";
        readonly entries: readonly (MidnightOfferEntry & {
          readonly rate_wad: string;
          readonly tick?: string;
        })[];
      };
};

type MidnightMakeIntent = MidnightMakerRequest &
  (
    | {
        readonly action: "midnight.make_borrow";
        readonly amount: Amount<"assets">;
        readonly market_params?: readonly MidnightMarketParams[];
        readonly collateral_supplies?: readonly MidnightCollateral<
          Amount<"assets">
        >[];
        readonly funding?: Funding;
      }
    | {
        readonly action: "midnight.make_lend";
        readonly amount: Amount<"assets">;
        readonly market_params?: readonly MidnightMarketParams[];
        readonly funding_source?:
          | { readonly type: "wallet" }
          | { readonly type: "variable_rate_market"; readonly market_id: Hex };
        readonly funding?: Funding;
      }
    | {
        readonly action: "midnight.make_repay" | "midnight.make_withdraw";
        readonly amount: Amount<"units">;
      }
  );

/** @internal */
export type MidnightTakeIntent = MidnightOfferRequest & {
  readonly group: Hex;
  readonly market_id?: Hex;
  readonly maker?: Address;
  readonly amount: MidnightAmount;
} & WithReferral &
  (
    | {
        readonly action: "midnight.take_borrow";
        readonly guard: MidnightSellGuard;
      }
    | {
        readonly action: "midnight.supply_collateral_take_borrow";
        readonly guard: MidnightSellGuard;
        readonly collateral_supplies: readonly MidnightCollateral<
          Amount<"assets">
        >[];
        readonly funding?: Funding;
      }
    | ({
        readonly action: "midnight.take_lend";
        readonly guard: MidnightBuyGuard;
      } & WithFunding)
  );

/** @internal */
export type MidnightOfferManagementIntent =
  | (CommonIntent & {
      readonly action: "midnight.cancel_offers";
      readonly expires_at?: number;
      readonly groups: readonly Hex[];
    })
  | (CommonIntent & {
      readonly action: "midnight.withdraw_funding";
      readonly expires_at?: number;
      readonly funding_address: Address;
      readonly funding_market: Hex;
    })
  | MidnightMakeIntent;

/** Original action request, with its chain, target and caller-approved fee ceiling. */
export type CalldataIntent =
  | VaultCalldataIntent
  | BlueCalldataIntent
  | MidnightMarketIntent
  | MidnightTakeIntent
  | MidnightOfferManagementIntent;

/** Exact HTTP exchange and independently trusted key set for Actions API proof verification. */
export interface ActionProofInput {
  /** The `Morpho-Action-Proof` response header. */
  readonly header: string;
  /** Trusted Morpho JWKS for the expected issuer; never take it from the action response. */
  readonly jwks: unknown;
  /** HTTP request as sent, before any parsing or reserialization. */
  readonly request: {
    readonly method: string;
    readonly path: string;
    readonly contentType: string;
    readonly body: Uint8Array;
  };
  /** HTTP response metadata and decompressed body bytes before JSON parsing. */
  readonly response: {
    readonly status: number;
    readonly contentType: string;
    readonly requestId: string;
    readonly body: Uint8Array;
  };
  /** Trusted expected issuer. Defaults to `https://api.morpho.org/v0/actions`. */
  readonly issuer?: string;
  /** Current verification time in Unix seconds, supplied by the caller. */
  readonly now: number;
}

/** An Actions API call to review; `kind` does not select verification rules. */
export interface CalldataCall {
  /** API call identifier, for error reporting. */
  readonly id: string;
  /** Untrusted API description of the call. */
  readonly kind: string;
  /** Transaction target. */
  readonly to: Address;
  /** Transaction calldata. */
  readonly data: Hex;
  /** Native transaction value, in base units as a decimal string. */
  readonly value: string;
}

/** A checked call and its decoded ABI arguments. */
export interface DecodedCalldataCall {
  /** Original verified call. */
  readonly call: Readonly<CalldataCall>;
  /** Name of the ABI function. */
  readonly functionName: string;
  /** ABI arguments. */
  readonly args: readonly unknown[];
  /** Checked nested calls if this is a multicall. */
  readonly calls?: readonly DecodedCalldataCall[];
}
