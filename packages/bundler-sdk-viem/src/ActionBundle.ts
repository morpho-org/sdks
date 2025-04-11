import type { SimulationResult } from "@morpho-org/simulation-sdk";
import type { Account, Address, Chain, Client, Hex, Transport } from "viem";
import { BundlerAction } from "./BundlerAction.js";
import type {
  Action,
  SignatureRequirement,
  TransactionRequirement,
} from "./types/index.js";

export class ActionBundleRequirements<
  TR extends { tx: { to: Address; data: Hex } } = TransactionRequirement,
  SR extends SignatureRequirement = SignatureRequirement,
> {
  constructor(
    public readonly txs: TR[] = [],
    public readonly signatures: SR[] = [],
  ) {}

  sign(client: Client<Transport, Chain | undefined, Account>): Promise<Hex[]>;
  sign(client: Client, account: Account): Promise<Hex[]>;
  sign(client: Client, account: Account = client.account!) {
    return Promise.all(
      this.signatures.map((requirement) => requirement.sign(client, account)),
    );
  }
}

export class ActionBundle<
  TR extends { tx: { to: Address; data: Hex } } = TransactionRequirement,
  SR extends SignatureRequirement = SignatureRequirement,
> {
  public readonly steps?: SimulationResult;
  public readonly chainId: number;

  constructor(
    steps: SimulationResult,
    actions?: Action[],
    requirements?: ActionBundleRequirements<TR, SR>,
  );
  constructor(
    chainId: number,
    actions?: Action[],
    requirements?: ActionBundleRequirements<TR, SR>,
  );
  constructor(
    stepsOrChainId: SimulationResult | number,
    public readonly actions: Action[] = [],
    public readonly requirements = new ActionBundleRequirements<TR, SR>(),
  ) {
    if (typeof stepsOrChainId === "number") {
      this.chainId = stepsOrChainId;
    } else {
      this.steps = stepsOrChainId;
      this.chainId = stepsOrChainId[0].chainId;
    }
  }

  tx() {
    return BundlerAction.encodeBundle(this.chainId, this.actions);
  }

  txs() {
    return this.requirements.txs.map(({ tx }) => tx).concat([this.tx()]);
  }
}
