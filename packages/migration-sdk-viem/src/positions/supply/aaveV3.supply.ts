import {
  type ChainId,
  MathLib,
  type Token,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { Time } from "@morpho-org/morpho-ts";

import type {
  MigrationBundle,
  MigrationTransactionRequirement,
} from "../../types/actions.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
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
import { aTokenV3Abi } from "../../abis/aaveV3.js";
import {
  type IMigratableSupplyPosition,
  MigratableSupplyPosition,
} from "./index.js";

interface IMigratableSupplyPosition_AaveV3
  extends Omit<IMigratableSupplyPosition, "protocol"> {
  nonce: bigint;
  aToken: Token;
}

export class MigratableSupplyPosition_AaveV3
  extends MigratableSupplyPosition
  implements IMigratableSupplyPosition_AaveV3
{
  private _nonce;
  public readonly aToken;

  constructor(config: IMigratableSupplyPosition_AaveV3) {
    super({ ...config, protocol: MigratableProtocol.aaveV3 });
    this.aToken = config.aToken;
    this._nonce = config.nonce;
  }

  get nonce() {
    return this._nonce;
  }

  getMigrationTx(
    { amount, minShares, vault }: MigratableSupplyPosition.Args,
    chainId: ChainId,
    supportsSignature = true,
  ): MigrationBundle {
    const signRequirements: SignatureRequirement[] = [];
    const txRequirements: MigrationTransactionRequirement[] = [];
    const actions: Action[] = [];

    const user = this.user;

    const {
      bundler3: { aaveV3CoreMigrationAdapter },
    } = getChainAddresses(chainId);

    const aToken = this.aToken;

    let migratedAmount = amount;

    const migrateMax =
      this.max.limiter === SupplyMigrationLimiter.position &&
      this.max.value === amount;

    if (migrateMax) {
      migratedAmount = maxUint256;
    }

    if (supportsSignature) {
      const deadline = Time.timestamp() + Time.s.from.d(1n);
      const nonce = this._nonce;

      const permitAction: Action = {
        type: "permit",
        args: [user, aToken.address, migratedAmount, deadline, null],
      };

      actions.push(permitAction);

      signRequirements.push({
        action: permitAction,
        async sign(client: Client, account: Account = client.account!) {
          let signature = permitAction.args[4];
          if (signature != null) return signature; // action is already signed

          const typedData = getPermitTypedData(
            {
              erc20: aToken,
              owner: user,
              spender: aaveV3CoreMigrationAdapter,
              allowance: migratedAmount,
              nonce,
              deadline,
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

          return (permitAction.args[4] = signature);
        },
      });
    } else {
      txRequirements.push({
        type: "erc20Approve",
        args: [aToken.address, aaveV3CoreMigrationAdapter, migratedAmount],
        tx: {
          to: aToken.address,
          data: encodeFunctionData({
            abi: aTokenV3Abi,
            functionName: "approve",
            args: [aaveV3CoreMigrationAdapter, migratedAmount],
          }),
        },
      });
    }

    actions.push({
      type: "erc20TransferFrom",
      args: [aToken.address, migratedAmount],
    });

    actions.push(
      {
        type: "aaveV3Withdraw",
        args: [this.loanToken, maxUint256],
      },
      {
        type: "erc4626Deposit",
        args: [vault, MathLib.MAX_UINT_128, minShares, user],
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
