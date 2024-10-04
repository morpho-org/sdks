import type { Address, MarketId } from "./types.js";

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

export class UnknownMarketConfigError extends UnknownDataError {
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

export namespace BlueErrors {
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
    constructor() {
      super(`inconsistent input: assets & shares cannot both be zero`);
    }
  }

  export class InsufficientLiquidity extends Error {
    constructor(public readonly marketId: MarketId) {
      super(`insufficient liquidity on market ${marketId}`);
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
}

export interface ErrorClass<E extends Error> {
  // biome-ignore lint/suspicious/noExplicitAny: match any type of arg
  new (...args: any[]): E;
}

export function _try<T, E extends Error>(
  accessor: () => T,
  ...errorClasses: ErrorClass<E>[]
): T | undefined {
  try {
    return accessor();
  } catch (error) {
    if (
      errorClasses.length === 0 ||
      errorClasses.some((errorClass) => error instanceof errorClass)
    )
      return;

    throw error;
  }
}
