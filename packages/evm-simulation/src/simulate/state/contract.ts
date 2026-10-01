import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";

/**
 * A view call issued in-block during the simulated execution, at the
 * `before` (block start) and `after` (block end) phases. `id` is a stable
 * dedupe key built from the subject fields; `to`/`data` are the encoded
 * call. Every variant carries the subject fields needed to place the
 * decoded value into the `SimulationState`.
 * @internal
 */
export type StateRead =
  | {
      readonly kind: "native.balance";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly account: Address;
    }
  | {
      readonly kind: "erc20.balance";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly token: Address;
      readonly account: Address;
    }
  | {
      readonly kind: "erc20.allowance";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
    }
  | {
      readonly kind: "erc2612.nonce";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly token: Address;
      readonly owner: Address;
    }
  | {
      readonly kind: "permit2.nonceBitmap";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly permit2: Address;
      readonly owner: Address;
      /** Tracked unordered nonce; its word position is `nonce >> 8`. */
      readonly nonce: bigint;
    }
  | {
      readonly kind: "morpho.isAuthorized";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly morpho: Address;
      readonly authorizer: Address;
      readonly authorized: Address;
    }
  | {
      readonly kind: "morpho.nonce";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly morpho: Address;
      readonly owner: Address;
    }
  | {
      readonly kind: "morpho.position";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly morpho: Address;
      readonly marketId: MarketId;
      readonly owner: Address;
    }
  | {
      readonly kind: "morpho.market";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly morpho: Address;
      readonly marketId: MarketId;
    }
  | {
      readonly kind: "morpho.oraclePrice";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly oracle: Address;
    }
  | {
      readonly kind: "morpho.irmRateAtTarget";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly irm: Address;
      readonly marketId: MarketId;
    }
  | {
      readonly kind: "preLiquidation.params";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly preLiquidation: Address;
      readonly marketId: MarketId;
    }
  | {
      readonly kind: "vault.totalAssets";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly vault: Address;
    }
  | {
      readonly kind: "vault.totalSupply";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly vault: Address;
    }
  | {
      readonly kind: "vault.balanceOf";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly vault: Address;
      readonly account: Address;
    }
  | {
      readonly kind: "vault.idleAssets";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly vault: Address;
      readonly asset: Address;
      readonly liquidityAdapter: Address;
    }
  | {
      readonly kind: "vault.allocation";
      readonly id: string;
      readonly to: Address;
      readonly data: Hex;
      readonly vault: Address;
      readonly allocationId: Hex;
    };

/** Phase of the simulated block at which a {@link StateRead} is executed. @internal */
export type ReadPhase = "before" | "intermediate" | "after";

/**
 * A {@link StateRead} paired with its decoded return value. `value` is the
 * raw decoded shape for the kind — tuples for `morpho.position` /
 * `morpho.market` / `preLiquidation.params`, scalars elsewhere.
 * @internal
 */
export interface DecodedStateRead {
  readonly read: StateRead;
  readonly value: unknown;
}
