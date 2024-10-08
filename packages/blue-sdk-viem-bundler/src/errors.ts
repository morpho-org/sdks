import type { SimulationResult } from "@morpho-org/blue-sdk-viem-simulation";

import type { InputBundlerOperation } from "./types/index.js";

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
}
