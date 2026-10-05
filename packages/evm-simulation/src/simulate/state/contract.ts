import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";

/** Minimal call replayed before and after the user bundle, or after it only for position health. @internal */
export type StateRead = {
  readonly id: string;
  readonly to: Address;
  readonly data: Hex;
} & (
  | {
      readonly kind: "erc20.balance";
      readonly token: Address;
      readonly account: Address;
    }
  | {
      readonly kind: "morpho.position";
      readonly morpho: Address;
      readonly marketId: MarketId;
      readonly owner: Address;
    }
  | {
      readonly kind: "morpho.accrueInterest" | "morpho.market";
      readonly marketId: MarketId;
    }
  | { readonly kind: "oracle.price"; readonly marketId: MarketId }
);

/** Phase at which a slippage observation is read. @internal */
export type ReadPhase = "before" | "after";
