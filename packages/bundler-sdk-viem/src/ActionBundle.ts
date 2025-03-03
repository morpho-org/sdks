import type { SimulationResult } from "@morpho-org/simulation-sdk";
import type { Account, Chain, Client, Hex, Transport } from "viem";
import { BundlerAction } from "./BundlerAction.js";
import type {
  Action,
  SignatureRequirement,
  TransactionRequirement,
} from "./types/index.js";

export class ActionBundleRequirements {
  constructor(
    public readonly txs: TransactionRequirement[] = [],
    public readonly signatures: SignatureRequirement[] = [],
  ) {}

  sign(client: Client<Transport, Chain | undefined, Account>): Promise<Hex[]>;
  sign(client: Client, account: Account): Promise<Hex[]>;
  sign(client: Client, account: Account = client.account!) {
    return Promise.all(
      this.signatures.map((requirement) => requirement.sign(client, account)),
    );
  }
}

export class ActionBundle {
  constructor(
    public readonly steps: SimulationResult,
    public readonly actions: Action[] = [],
    public readonly requirements = new ActionBundleRequirements(),
  ) {}

  tx() {
    return BundlerAction.encodeBundle(this.steps[0].chainId, this.actions);
  }

  txs() {
    return this.requirements.txs.map(({ tx }) => tx).concat([this.tx()]);
  }
}
