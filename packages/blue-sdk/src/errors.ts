export {
  DivisionByZeroError,
  IncompleteChainRegistryError,
  InvalidBitLengthError,
  RegistryValueAlreadyRegisteredError,
  UnknownAddressError,
  UnsupportedChainIdError,
} from "@morpho-org/morpho-ts";

import { formatUnits, type Hex } from "viem";
import type { Address, MarketId } from "./types.js";

/** Error thrown when bytes cannot be decoded into valid Morpho Blue market params. */
export class InvalidMarketParamsError extends Error {
  constructor(public readonly data: Hex) {
    super(`cannot decode valid MarketParams from "${data}"`);
  }
}

/** Base error for optional data lookups that were not available. */
export class UnknownDataError extends Error {}

/** Error thrown when token metadata is unavailable for an address. */
export class UnknownTokenError extends UnknownDataError {
  constructor(public readonly address: Address) {
    super(`unknown token ${address}`);
  }
}

/** Error thrown when a token price is unavailable for an address. */
export class UnknownTokenPriceError extends UnknownDataError {
  constructor(public readonly address: Address) {
    super(`unknown price of token ${address}`);
  }
}

/** Error thrown when market params are unavailable for a market id. */
export class UnknownMarketParamsError extends UnknownDataError {
  constructor(public readonly marketId: MarketId) {
    super(`unknown config for market ${marketId}`);
  }
}

/** Error thrown when vault config is unavailable for a vault address. */
export class UnknownVaultConfigError extends UnknownDataError {
  constructor(public readonly vault: Address) {
    super(`unknown config for vault ${vault}`);
  }
}

/** Error thrown when a vault withdraw queue references a market without an allocation. */
export class UnknownMarketAllocationError extends UnknownDataError {
  constructor(public readonly marketId: MarketId) {
    super(`unknown allocation for market ${marketId}`);
  }
}

/** Error thrown when no default pre-liquidation params exist for an LLTV. */
export class UnsupportedPreLiquidationParamsError extends Error {
  constructor(public readonly lltv: bigint) {
    super(
      `unsupported pre liquidation params for lltv ${formatUnits(lltv, 16)}%`,
    );
  }
}

/** Error thrown when a Vault V2 adapter address is not supported by the SDK. */
export class UnsupportedVaultV2AdapterError extends Error {
  constructor(public readonly address: Address) {
    super(`vault v2 adapter "${address}" is not supported`);
  }
}

/** Morpho Blue protocol simulation errors. */
export namespace BlueErrors {
  /** Error thrown when a value that must be set once is already set. */
  export class AlreadySet extends Error {
    constructor(
      public readonly name: string,
      public readonly value: string,
    ) {
      super(`${name} is already set to ${value}`);
    }
  }

  /** Error thrown when market interest accrual is requested before `lastUpdate`. */
  export class InvalidInterestAccrual extends Error {
    // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
    constructor(
      public readonly marketId: MarketId,
      public readonly timestamp: bigint,
      public readonly lastUpdate: bigint,
    ) {
      super(
        `invalid interest accrual on market ${marketId}: accrual timestamp ${timestamp} can't be prior to last update ${lastUpdate}`,
      );
    }
  }

  /** Error thrown when asset and share inputs describe inconsistent values. */
  export class InconsistentInput extends Error {
    constructor(
      public readonly assets: bigint,
      public readonly shares: bigint,
    ) {
      super(`inconsistent input assets "${assets}" and shares "${shares}"`);
    }
  }

  /** Error thrown when a market has insufficient liquidity for an operation. */
  export class InsufficientLiquidity extends Error {
    constructor(public readonly marketId: MarketId) {
      super(`insufficient liquidity on market ${marketId}`);
    }
  }

  /** Error thrown when a market oracle price is unavailable. */
  export class UnknownOraclePrice extends Error {
    constructor(public readonly marketId: MarketId) {
      super(`unknown oracle price of market "${marketId}"`);
    }
  }

  /** Error thrown when a user position is too small for an operation. */
  export class InsufficientPosition extends Error {
    constructor(
      public readonly user: Address,
      public readonly marketId: MarketId,
    ) {
      super(`insufficient position for user ${user} on market ${marketId}`);
    }
  }

  /** Error thrown when a user position lacks required collateral. */
  export class InsufficientCollateral extends Error {
    constructor(
      public readonly user: Address,
      public readonly marketId: MarketId,
    ) {
      super(`insufficient collateral for user ${user} on market ${marketId}`);
    }
  }

  /** Error thrown when a signature deadline has expired. */
  export class ExpiredSignature extends Error {
    constructor(public readonly deadline: bigint) {
      super(`expired signature deadline "${deadline}"`);
    }
  }
}

/** Morpho Vault V2 simulation errors. */
export namespace VaultV2Errors {
  /** Error thrown when vault interest accrual is requested before `lastUpdate`. */
  export class InvalidInterestAccrual extends Error {
    // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
    constructor(
      public readonly vault: Address,
      public readonly timestamp: bigint,
      public readonly lastUpdate: bigint,
    ) {
      super(
        `invalid interest accrual on vault ${vault}: accrual timestamp ${timestamp} can't be prior to last update ${lastUpdate}`,
      );
    }
  }

  /** Error thrown when a Vault V2 liquidity adapter is not supported by the SDK. */
  export class UnsupportedLiquidityAdapter extends Error {
    constructor(public readonly address: Address) {
      super(`unsupported liquidity adapter "${address}"`);
    }
  }
}

/** Error thrown when a factory address is unavailable. */
export class UnknownFactory extends Error {
  constructor() {
    super(`unknown factory`);
  }
}

/** Error thrown when an address is not deployed by the expected factory. */
export class UnknownOfFactory extends Error {
  constructor(
    public readonly factory: Address,
    public readonly address: Address,
  ) {
    super(`address "${address}" is not from the ${factory} factory`);
  }
}

/** Constructor type for errors accepted by `_try`. */
export interface ErrorClass<E extends Error = Error> {
  // biome-ignore lint/suspicious/noExplicitAny: match any type of arg
  new (...args: any[]): E;
}

/**
 * Runs an async accessor and returns `undefined` for expected lookup errors.
 *
 * @internal
 */
export function _try<T, ErrorClasses extends readonly ErrorClass[] = []>(
  accessor: () => Promise<T>,
  ...errorClasses: ErrorClasses
): Promise<T | undefined>;
/**
 * Runs a sync accessor and returns `undefined` for expected lookup errors.
 *
 * @internal
 */
export function _try<T, ErrorClasses extends readonly ErrorClass[] = []>(
  accessor: () => T,
  ...errorClasses: ErrorClasses
): T | undefined;
/**
 * Runs an accessor and returns `undefined` for expected lookup errors.
 *
 * @internal
 */
export function _try<T, ErrorClasses extends readonly ErrorClass[] = []>(
  accessor: () => T | Promise<T>,
  ...errorClasses: ErrorClasses
): T | undefined | Promise<T | undefined> {
  const maybeCatchError = (error: unknown): undefined => {
    if (
      errorClasses.length === 0 ||
      errorClasses.some((errorClass) => error instanceof errorClass)
    )
      return;

    throw error;
  };

  try {
    const res = accessor();

    if (res instanceof Promise) return res.catch(maybeCatchError);
    return res;
  } catch (error) {
    return maybeCatchError(error);
  }
}
