import type { MarketInput } from "@morpho-org/midnight-sdk";
import type { Address, Hex } from "viem";
import type {
  MidnightBlueSupply,
  MidnightCollateralTransfer,
  MidnightGroupCancellation,
} from "./action.js";
import type { Metadata } from "./metadata.js";

/**
 * Delegated root-activation signature passed to the ratifier's `setIsRootRatifiedWithSig`.
 * Omit it to activate the root directly with `setIsRootRatified`.
 */
export interface MidnightRootActivationSignature {
  /** Tree height committed by the signature. */
  readonly height: bigint;
  /** Ratifier signature nonce. */
  readonly nonce: bigint;
  /** Signature deadline timestamp, independent of the bundle deadline. */
  readonly deadline: bigint;
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
}

/** Collateral supplied for the maker before root activation; every offer must target `market`. */
export interface MidnightMakeBorrowCollateral {
  readonly market: MarketInput;
  readonly supplies: readonly MidnightCollateralTransfer[];
}

/** Offer root activated and published by a Midnight Bundles V2 maker bundle. */
export interface MidnightOfferPublication {
  /**
   * The chain's registered `priceRatifierV1` or `rateRatifierV1`, which activates `root`.
   * MidnightBundlesV2 authorizes it over the maker's whole Midnight account.
   */
  readonly ratifier: Address;
  /** Offer tree root to activate. */
  readonly root: Hex;
  /** Distinct offer groups contained in `root`. */
  readonly groups: readonly Hex[];
  /** Encoded offer payload for `root`, published to the Midnight log. */
  readonly payload: Hex;
  /**
   * Optional builder-only delegated root-activation signature. Maker entity methods never set it;
   * they encode zero signature fields and rely on MidnightBundlesV2 authorization.
   */
  readonly rootSignature?: MidnightRootActivationSignature;
  /** Optional loan assets parked on Morpho Blue for the maker; share-price slippage is not checked. */
  readonly blueSupply?: MidnightBlueSupply;
  /** Optional collateral supplied to `market` for the maker before activation. */
  readonly collateral?: MidnightMakeBorrowCollateral;
}

/**
 * Parameters for encoding a Midnight Bundles V2 maker bundle: an offer publication or repost, or,
 * without a publication, a cancellation of offer groups only.
 */
export interface MidnightCancelAndMakeParams {
  /** Chain id used to resolve `MidnightBundlesV2`. */
  readonly chainId: number;
  /** Offer groups to cancel, each with its largest accepted consumption. Empty for a new publication. */
  readonly cancellations: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  /**
   * Optional native ETH sent as `value`; the bundle wraps it into the chain's wNative and transfers
   * it to `msg.sender` before pulling. It may cover part or all of the maximum wNative amount this
   * call can pull, but not more. Any wrapped native not pulled stays in the sender's wallet as
   * wNative. The wNative approval to `MidnightBundlesV2` is still required for the full pulled amount.
   */
  readonly nativeAmount?: bigint;
  /** Optional analytics metadata appended to calldata. */
  readonly metadata?: Metadata;
  /** Offers to publish after the cancellations. Omit to cancel offer groups only. */
  readonly publication?: MidnightOfferPublication;
}
