import {
  type Action,
  ActionBundleRequirements,
  BundlerAction,
} from "@morpho-org/bundler-sdk-viem";
import type { MigrationTransactionRequirement } from "./types/index.js";

export class MigrationBundle {
  constructor(
    public readonly chainId: number,
    public readonly actions: Action[] = [],
    public readonly requirements = new ActionBundleRequirements<MigrationTransactionRequirement>(),
  ) {}

  tx() {
    return BundlerAction.encodeBundle(this.chainId, this.actions);
  }

  txs() {
    return this.requirements.txs.map(({ tx }) => tx).concat([this.tx()]);
  }
}
