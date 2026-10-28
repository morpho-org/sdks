import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";

/** Minimal view call replayed before and after the user bundle. @internal */
export type StateRead = {
  readonly id: string;
  readonly to: Address;
  readonly data: Hex;
} & (
  | {
      readonly kind: "derivation";
      readonly operationIndex?: number;
      readonly subject?: string;
    }
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
      readonly kind: "midnight.collateral";
      readonly midnight: Address;
      readonly marketId: Hex;
      readonly collateralIndex: bigint;
      readonly owner: Address;
    }
  | {
      /** `updatePositionView(market, id, owner)`: credit with fees and losses accrued to the read's block. */
      readonly kind: "midnight.credit";
      readonly midnight: Address;
      readonly marketId: Hex;
      readonly owner: Address;
    }
  | {
      /** `debt(id, owner)`: debt does not accrue between reads. */
      readonly kind: "midnight.debt";
      readonly midnight: Address;
      readonly marketId: Hex;
      readonly owner: Address;
    }
);

/** Phase at which a slippage observation is read. @internal */
export type ReadPhase = "before" | "after";
