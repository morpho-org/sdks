import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  Metadata,
  MidnightBuyTarget,
  MidnightSellTarget,
} from "../../types/index.js";
import type { MidnightTakeableOffer } from "./types.js";

/** Owns only supported analytics fields without retaining caller context. @internal */
export const snapshotMidnightMetadata = (
  metadata: Metadata | undefined,
): Metadata | undefined => {
  if (metadata == null) {
    return undefined;
  }
  const { origin, timestamp } = metadata;
  return { origin, ...(timestamp !== undefined && { timestamp }) };
};

type SnapshotInput = {
  readonly market: MarketInput;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  readonly metadata?: Metadata;
};
type TakeSnapshot<Target> = {
  readonly market: ReturnType<typeof MarketUtils.toStruct>;
  readonly target: Target;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
  readonly metadata: Metadata | undefined;
};

/** Owns supported buy fields without freezing caller-owned classes or extra context. @internal */
export function snapshotMidnightTakeParams(
  params: SnapshotInput & {
    readonly direction: "buy";
    readonly target: MidnightBuyTarget;
  },
): TakeSnapshot<MidnightBuyTarget>;
/** Owns supported sell fields without freezing caller-owned classes or extra context. @internal */
export function snapshotMidnightTakeParams(
  params: SnapshotInput & {
    readonly direction: "sell";
    readonly target: MidnightSellTarget;
  },
): TakeSnapshot<MidnightSellTarget>;
/** Copies supported fields when the direction is selected at runtime. @internal */
export function snapshotMidnightTakeParams(
  params: SnapshotInput &
    (
      | { readonly direction: "buy"; readonly target: MidnightBuyTarget }
      | { readonly direction: "sell"; readonly target: MidnightSellTarget }
    ),
): TakeSnapshot<MidnightBuyTarget | MidnightSellTarget>;
/** Copies only the fields required for the selected direction. @internal */
export function snapshotMidnightTakeParams(
  params: SnapshotInput &
    (
      | { readonly direction: "buy"; readonly target: MidnightBuyTarget }
      | { readonly direction: "sell"; readonly target: MidnightSellTarget }
    ),
): TakeSnapshot<MidnightBuyTarget | MidnightSellTarget> {
  let target: MidnightBuyTarget | MidnightSellTarget;
  if (params.direction === "buy") {
    target =
      params.target.type === "assets"
        ? {
            type: "assets",
            assets: params.target.assets,
            minUnits: params.target.minUnits,
          }
        : {
            type: "units",
            units: params.target.units,
            maxBuyerAssets: params.target.maxBuyerAssets,
          };
  } else {
    target =
      params.target.type === "assets"
        ? {
            type: "assets",
            assets: params.target.assets,
            maxUnits: params.target.maxUnits,
          }
        : {
            type: "units",
            units: params.target.units,
            minSellerAssets: params.target.minSellerAssets,
          };
  }
  return {
    market: deepFreeze(MarketUtils.toStruct(params.market)),
    target: Object.freeze(target),
    takeableOffers: deepFreeze(
      params.takeableOffers.map(({ units, offer, ratifierData }) => ({
        units,
        offer: {
          market: MarketUtils.toStruct(offer.market),
          buy: offer.buy,
          maker: offer.maker,
          start: offer.start,
          expiry: offer.expiry,
          tick: offer.tick,
          group: offer.group,
          callback: offer.callback,
          callbackData: offer.callbackData,
          receiverIfMakerIsSeller: offer.receiverIfMakerIsSeller,
          ratifier: offer.ratifier,
          reduceOnly: offer.reduceOnly,
          maxUnits: offer.maxUnits,
          maxAssets: offer.maxAssets,
          continuousFeeCap: offer.continuousFeeCap,
        },
        ratifierData,
      })),
    ),
    metadata: snapshotMidnightMetadata(params.metadata),
  };
}
