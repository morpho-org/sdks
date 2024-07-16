import { Token } from "../token";

export interface MaxBalanceDecomposition {
  maxBalance: bigint;
  decomposition: { base: BalanceDecompositionFragment } & {
    [T in Exclude<PeripheralTokenType, "base">]?: BalanceDecompositionFragment;
  };
}

export type PeripheralTokenType =
  | "base"
  | "wrapped"
  | "erc4626"
  | "wrapped-erc4626"
  | "staked-wrapped"
  | "unwrapped-staked-wrapped";
export interface PeripheralToken {
  token: Token;
  type: PeripheralTokenType;
}

export interface BalanceDecompositionFragment extends PeripheralToken {
  underlyingValue: bigint;
  value: bigint;
}
