import {
  type Address,
  type ErrorClass,
  type MarketId,
  UnknownDataError,
} from "@morpho-org/blue-sdk";

import { entries } from "@morpho-org/morpho-ts";
import type { Hex } from "viem";
import type { Operation, OperationType } from "./operations.js";

export class UnexpectedOperation extends Error {
  constructor(type: OperationType, chainId: number) {
    super(`unexpected operation "${type}" on chain "${chainId}"`);
  }
}

export class UnknownMarketError extends UnknownDataError {
  constructor(public readonly marketId: MarketId) {
    super(`unknown market "${marketId}"`);
  }
}

export class UnknownUserError extends UnknownDataError {
  constructor(public readonly user: Address) {
    super(`unknown user "${user}"`);
  }
}

export class UnknownPositionError extends UnknownDataError {
  constructor(
    public readonly user: Address,
    public readonly marketId: MarketId,
  ) {
    super(`unknown position of user "${user}" on market "${marketId}"`);
  }
}

export class UnknownHoldingError extends UnknownDataError {
  constructor(
    public readonly user: Address,
    public readonly token: Address,
  ) {
    super(`unknown holding of user "${user}" of token "${token}"`);
  }
}

export class UnknownVaultError extends UnknownDataError {
  constructor(public readonly vault: Address) {
    super(`unknown vault "${vault}"`);
  }
}

export class UnknownVaultMarketConfigError extends UnknownDataError {
  constructor(
    public readonly vault: Address,
    public readonly marketId: MarketId,
  ) {
    super(`unknown config for vault "${vault}" on market "${marketId}"`);
  }
}

export class UnknownVaultUserError extends UnknownDataError {
  constructor(
    public readonly vault: Address,
    public readonly user: Address,
  ) {
    super(`unknown user "${user}" of vault "${vault}"`);
  }
}

export class UnknownWrappedTokenError extends UnknownDataError {
  constructor(public readonly token: Address) {
    super(`unknown wrapped token "${token}"`);
  }
}

export class UnknownContractError extends UnknownDataError {
  constructor(public readonly contract: Address) {
    super(`unknown contract "${contract}"`);
  }
}

export class UnknownAllowanceError extends UnknownDataError {
  constructor(
    public readonly token: Address,
    public readonly owner: Address,
    public readonly spender: Address,
  ) {
    super(
      `unknown allowance for token "${token}" from owner "${owner}" to spender "${spender}"`,
    );
  }
}

export class UnknownEIP2612DataError extends UnknownDataError {
  constructor(
    public readonly token: Address,
    public readonly owner: Address,
  ) {
    super(`unknown EIP-2612 data for token "${token}" of owner "${owner}"`);
  }
}

export class UnknownVaultPublicAllocatorConfigError extends UnknownDataError {
  constructor(public readonly vault: Address) {
    super(`missing public allocator config for vault "${vault}"`);
  }
}

export class UnknownVaultMarketPublicAllocatorConfigError extends UnknownDataError {
  constructor(
    public readonly vault: Address,
    public readonly marketId: MarketId,
  ) {
    super(
      `missing public allocator config for vault "${vault}" on market "${marketId}"`,
    );
  }
}

export namespace Erc20Errors {
  export class InsufficientBalance extends Error {
    constructor(
      public readonly token: Address,
      public readonly user: Address,
    ) {
      super(`insufficient balance of user "${user}" for token "${token}"`);
    }
  }

  export class InsufficientAllowance extends Error {
    constructor(
      public readonly token: Address,
      public readonly owner: Address,
      public readonly spender: Address,
    ) {
      super(
        `insufficient allowance for token "${token}" from owner "${owner}" to spender "${spender}"`,
      );
    }
  }

  export class InvalidEIP2612Nonce extends Error {
    constructor(
      public readonly token: Address,
      public readonly owner: Address,
      public readonly nonce: bigint,
    ) {
      super(
        `invalid EIP-2612 nonce "${nonce}" for token "${token}" of owner "${owner}"`,
      );
    }
  }

  export class InvalidPermit2Nonce extends Error {
    constructor(
      public readonly token: Address,
      public readonly owner: Address,
      public readonly nonce: bigint,
    ) {
      super(
        `invalid permit2 nonce "${nonce}" for token "${token}" from owner "${owner}"`,
      );
    }
  }

  export class InsufficientPermit2Allowance extends Error {
    constructor(
      public readonly token: Address,
      public readonly owner: Address,
    ) {
      super(
        `insufficient permit2 allowance for token "${token}" from owner "${owner}"`,
      );
    }
  }

  export class UnauthorizedTransfer extends Error {
    constructor(
      public readonly token: Address,
      public readonly user: Address,
    ) {
      super(`unauthorized transfer of token "${token}" from owner "${user}"`);
    }
  }
}

export namespace SimulationErrors {
  export class Simulation<T extends Operation = Operation> extends Error {
    constructor(
      public readonly error: Error,
      public readonly index: number,
      public readonly operation: T,
    ) {
      super(error.message);

      this.stack = error.stack;
    }
  }

  export class InvalidInput<T> extends Error {
    constructor(public readonly input: T) {
      super(
        `invalid input: ${entries(input)
          .map((entry) => entry.join("="))
          .join(", ")}`,
      );
    }
  }
}

export namespace BlueSimulationErrors {
  export class MarketNotEnabled extends Error {
    constructor(public readonly marketId: MarketId) {
      super(`market "${marketId}" not enabled`);
    }
  }

  export class ZeroAssets extends Error {
    constructor() {
      super(`zero assets`);
    }
  }

  export class UnauthorizedBundler extends Error {
    constructor(public readonly user: Address) {
      super(`unauthorized bundler for user "${user}"`);
    }
  }
}

export namespace MetaMorphoErrors {
  export class ZeroAssets extends Error {
    constructor() {
      super(`zero assets`);
    }
  }

  export class ZeroShares extends Error {
    constructor() {
      super(`zero shares`);
    }
  }

  export class NotAllocatorRole extends Error {
    constructor(
      public readonly vault: Address,
      public readonly account: Address,
    ) {
      super(`account ${account} not allocator of vault "${vault}"`);
    }
  }

  export class NotEnoughLiquidity extends Error {
    constructor(
      public readonly vault: Address,
      public readonly remainingRequested: bigint,
    ) {
      super(
        `not enough liquidity on vault "${vault}" (remaining requested: ${remainingRequested})`,
      );
    }
  }

  export class MarketNotEnabled extends Error {
    constructor(
      public readonly vault: Address,
      public readonly marketId: MarketId,
    ) {
      super(`market "${marketId}" not enabled on vault "${vault}"`);
    }
  }

  export class UnauthorizedMarket extends Error {
    constructor(
      public readonly vault: Address,
      public readonly marketId: MarketId,
    ) {
      super(`unauthorized market "${marketId}" on vault "${vault}"`);
    }
  }

  export class SupplyCapExceeded extends Error {
    constructor(
      public readonly vault: Address,
      public readonly marketId: MarketId,
      public readonly cap: bigint,
    ) {
      super(
        `supply cap of ${cap} exceeded for vault "${vault}" on market "${marketId}"`,
      );
    }
  }

  export class AllCapsReached extends Error {
    constructor(
      public readonly vault: Address,
      public readonly remainingRequested: bigint,
    ) {
      super(
        `all caps reached on vault "${vault}" (remaining requested: ${remainingRequested})`,
      );
    }
  }

  export class InconsistentReallocation extends Error {
    constructor(
      public readonly vault: Address,
      public readonly totalSupplied: bigint,
      public readonly totalWithdrawn: bigint,
    ) {
      super(
        `inconsistent reallocation for vault "${vault}": total supplied (${totalSupplied}) != total withdrawn (${totalWithdrawn})`,
      );
    }
  }
}

export namespace PublicAllocatorErrors {
  export class WithdrawZero extends Error {
    constructor(
      public readonly vault: Address,
      public readonly marketId: MarketId,
    ) {
      super(`vault "${vault}" withdrawing 0 on market "${marketId}"`);
    }
  }

  export class EmptyWithdrawals extends Error {
    constructor(public readonly vault: Address) {
      super(`empty withdrawals for vault "${vault}"`);
    }
  }

  export class InconsistentWithdrawals extends Error {
    constructor(
      public readonly vault: Address,
      public readonly prevId: MarketId,
      public readonly nextId: MarketId,
    ) {
      super(
        `inconsistent withdrawals for vault "${vault}": "${prevId}" is expected to appear before "${nextId}"`,
      );
    }
  }

  export class MaxOutflowExceeded extends Error {
    constructor(
      public readonly vault: Address,
      public readonly marketId: MarketId,
    ) {
      super(
        `max outflow exceeded for vault "${vault}" on market "${marketId}"`,
      );
    }
  }

  export class MaxInflowExceeded extends Error {
    constructor(
      public readonly vault: Address,
      public readonly marketId: MarketId,
    ) {
      super(`max inflow exceeded for vault "${vault}" on market "${marketId}"`);
    }
  }

  export class DepositMarketInWithdrawals extends Error {
    constructor(
      public readonly vault: Address,
      public readonly supplyMarketId: MarketId,
    ) {
      super(
        `supply market "${supplyMarketId}" in withdrawals of vault "${vault}"`,
      );
    }
  }

  export class NotEnoughSupply extends Error {
    constructor(
      public readonly vault: Address,
      public readonly marketId: MarketId,
    ) {
      super(`not enough supply of vault "${vault}" on market "${marketId}"`);
    }
  }
}

export namespace ParaswapErrors {
  export class InvalidOffset extends Error {
    constructor(
      public readonly offset: number,
      public readonly data: Hex,
    ) {
      super(
        `invalid offset "${offset}" does not leave 32 bytes of data "${data}"`,
      );
    }
  }

  export class ZeroAmount extends Error {
    constructor() {
      super(`zero amount`);
    }
  }
}

export function getWrappedInstanceOf<E extends Error>(
  err: unknown,
  ...errorClasses: [ErrorClass<E>, ...ErrorClass<E>[]]
): E | undefined {
  if (errorClasses.find((errorClass) => err instanceof errorClass))
    return err as E;

  if (!err || typeof err !== "object" || !("error" in err)) return;

  return getWrappedInstanceOf(err.error, ...errorClasses);
}
