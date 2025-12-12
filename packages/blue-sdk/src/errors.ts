import { type Hex, formatUnits } from "viem";
import type { Address, MarketId } from "./types.js";

export class InvalidMarketParamsError extends Error {
  constructor(public readonly data: Hex) {
    super(`cannot decode valid MarketParams from "${data}"`);
  }
}

export class UnknownDataError extends Error {}

export class UnknownTokenError extends UnknownDataError {
  constructor(public readonly address: Address) {
    super(`unknown token ${address}`);
  }
}

export class UnknownTokenPriceError extends UnknownDataError {
  constructor(public readonly address: Address) {
    super(`unknown price of token ${address}`);
  }
}

export class UnknownMarketParamsError extends UnknownDataError {
  constructor(public readonly marketId: MarketId) {
    super(`unknown config for market ${marketId}`);
  }
}

export class UnknownVaultConfigError extends UnknownDataError {
  constructor(public readonly vault: Address) {
    super(`unknown config for vault ${vault}`);
  }
}

export class UnsupportedChainIdError extends Error {
  constructor(public readonly chainId: number) {
    super(`unsupported chain ${chainId}`);
  }
}

export class UnsupportedPreLiquidationParamsError extends Error {
  constructor(public readonly lltv: bigint) {
    super(
      `unsupported pre liquidation params for lltv ${formatUnits(lltv, 16)}%`,
    );
  }
}

export class UnsupportedVaultV2AdapterError extends Error {
  constructor(public readonly address: Address) {
    super(`vault v2 adapter "${address}" is not supported`);
  }
}

export namespace BlueErrors {
  export class AlreadySet extends Error {
    constructor(
      public readonly name: string,
      public readonly value: string,
    ) {
      super(`${name} is already set to ${value}`);
    }
  }

  export class InvalidInterestAccrual extends Error {
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

  export class InconsistentInput extends Error {
    constructor(
      public readonly assets: bigint,
      public readonly shares: bigint,
    ) {
      super(`inconsistent input assets "${assets}" and shares "${shares}"`);
    }
  }

  export class InsufficientLiquidity extends Error {
    constructor(public readonly marketId: MarketId) {
      super(`insufficient liquidity on market ${marketId}`);
    }
  }

  export class UnknownOraclePrice extends Error {
    constructor(public readonly marketId: MarketId) {
      super(`unknown oracle price of market "${marketId}"`);
    }
  }

  export class InsufficientPosition extends Error {
    constructor(
      public readonly user: Address,
      public readonly marketId: MarketId,
    ) {
      super(`insufficient position for user ${user} on market ${marketId}`);
    }
  }

  export class InsufficientCollateral extends Error {
    constructor(
      public readonly user: Address,
      public readonly marketId: MarketId,
    ) {
      super(`insufficient collateral for user ${user} on market ${marketId}`);
    }
  }

  export class ExpiredSignature extends Error {
    constructor(public readonly deadline: bigint) {
      super(`expired signature deadline "${deadline}"`);
    }
  }
}

export namespace VaultV2Errors {
  export class InvalidInterestAccrual extends Error {
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

  export class UnsupportedLiquidityAdapter extends Error {
    constructor(public readonly address: Address) {
      super(`unsupported liquidity adapter "${address}"`);
    }
  }
}

export interface ErrorClass<E extends Error = Error> {
  // biome-ignore lint/suspicious/noExplicitAny: match any type of arg
  new (...args: any[]): E;
}

export function _try<T, ErrorClasses extends readonly ErrorClass[] = []>(
  accessor: () => Promise<T>,
  ...errorClasses: ErrorClasses
): Promise<T | undefined>;
export function _try<T, ErrorClasses extends readonly ErrorClass[] = []>(
  accessor: () => T,
  ...errorClasses: ErrorClasses
): T | undefined;
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
