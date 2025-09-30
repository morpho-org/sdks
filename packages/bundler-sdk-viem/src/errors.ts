import type {
  OperationType,
  SimulationResult,
} from "@morpho-org/simulation-sdk";

import type { Address } from "viem";
import type { ActionType, InputBundlerOperation } from "./types/index.js";

export namespace BundlerErrors {
  export class Bundle extends Error {
    constructor(
      public readonly error: Error,
      public readonly index: number,
      public readonly inputOperation: InputBundlerOperation,
      public readonly steps: SimulationResult,
    ) {
      super(error.message);

      this.stack = error.stack;
    }
  }

  export class MissingSignature extends Error {
    constructor() {
      super(`missing signature`);
    }
  }

  export class MissingSwapData extends Error {
    constructor() {
      super(`missing swap data`);
    }
  }

  export class UnexpectedAction extends Error {
    constructor(type: ActionType, chainId: number) {
      super(`unexpected action "${type}" on chain "${chainId}"`);
    }
  }

  export class UnexpectedSignature extends Error {
    constructor(spender: Address) {
      super(`unexpected signature consumer "${spender}"`);
    }
  }

  export class MissingSkimHandler extends Error {
    constructor(type: OperationType) {
      super(`missing skim handler for operation "${type}"`);
    }
  }

  export class UnskimedToken extends Error {
    constructor(token: Address) {
      super(`missing final skim for token "${token}"`);
    }
  }
}
