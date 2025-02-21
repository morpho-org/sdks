import {
  type Address,
  type ChainId,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

import type {
  Action,
  SignatureRequirement,
} from "@morpho-org/bundler-sdk-viem";
import BundlerAction from "@morpho-org/bundler-sdk-viem/src/BundlerAction.js";
import {
  type Account,
  type Client,
  encodeFunctionData,
  maxUint256,
  verifyTypedData,
} from "viem";
import { signTypedData } from "viem/actions";
import { cometExtAbi } from "../../abis/compoundV3.js";
import type {
  MigrationBundle,
  MigrationTransactionRequirement,
} from "../../types/actions.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";
import { getCompoundV3ManagerApprovalMessage } from "../signature/compoundV3.js";
import {
  type IMigratableSupplyPosition,
  MigratableSupplyPosition,
} from "./index.js";

interface IMigratableSupplyPosition_CompoundV3
  extends Omit<IMigratableSupplyPosition, "protocol"> {
  nonce: bigint;
  cometAddress: Address;
  cometName: string;
}

export class MigratableSupplyPosition_CompoundV3
  extends MigratableSupplyPosition
  implements IMigratableSupplyPosition_CompoundV3
{
  private _nonce;
  public readonly cometAddress;
  public readonly cometName;

  constructor(config: IMigratableSupplyPosition_CompoundV3) {
    super({ ...config, protocol: MigratableProtocol.compoundV3 });
    this._nonce = config.nonce;
    this.cometAddress = config.cometAddress;
    this.cometName = config.cometName;
  }

  get nonce() {
    return this._nonce;
  }

  getMigrationTx(
    { amount, maxSharePrice, vault }: MigratableSupplyPosition.Args,
    chainId: ChainId,
    supportsSignature = true,
  ): MigrationBundle {
    const signRequirements: SignatureRequirement[] = [];
    const txRequirements: MigrationTransactionRequirement[] = [];
    const actions: Action[] = [];

    const user = this.user;

    const {
      bundler3: { generalAdapter1, compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);

    const migrateMax =
      this.max.limiter === SupplyMigrationLimiter.position &&
      this.max.value === amount;

    let migratedAmount = amount;

    if (migrateMax) {
      migratedAmount = maxUint256;
    }

    const instance = this.cometAddress;
    const nonce = this._nonce;
    const name = this.cometName;

    if (supportsSignature) {
      const expiry = Time.timestamp() + Time.s.from.d(1n);

      const allowAction: Action = {
        type: "compoundV3AllowBySig",
        args: [instance, user, true, nonce, expiry, null],
      };

      actions.push(allowAction);

      signRequirements.push({
        action: allowAction,
        async sign(client: Client, account: Account = client.account!) {
          let signature = allowAction.args[5];
          if (signature != null) return signature; // action is already signed

          const typedData = getCompoundV3ManagerApprovalMessage(
            {
              name,
              instance,
              owner: user,
              manager: compoundV3MigrationAdapter,
              isAllowed: true,
              nonce,
              expiry,
            },
            chainId,
          );
          signature = await signTypedData(client, {
            ...typedData,
            account,
          });

          await verifyTypedData({
            ...typedData,
            address: user, // Verify against the permit's owner.
            signature,
          });

          return (allowAction.args[5] = signature);
        },
      });
    } else {
      txRequirements.push({
        type: "compoundV3ApproveManager",
        args: [compoundV3MigrationAdapter, true],
        tx: {
          to: instance,
          data: encodeFunctionData({
            abi: cometExtAbi,
            functionName: "allow",
            args: [compoundV3MigrationAdapter, true],
          }),
        },
      });
    }

    actions.push(
      {
        type: "compoundV3WithdrawFrom",
        args: [instance, this.loanToken, migratedAmount, generalAdapter1],
      },
      {
        type: "erc4626Deposit",
        args: [vault, maxUint256, maxSharePrice, user],
      },
    );

    return {
      actions,
      requirements: {
        signatures: signRequirements,
        txs: txRequirements,
      },
      tx: () => BundlerAction.encodeBundle(chainId, actions),
    };
  }
}
