import {
  type ChainId,
  type Token,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { Time } from "@morpho-org/morpho-ts";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import type { Action } from "@morpho-org/bundler-sdk-viem";
import {
  type Account,
  type Client,
  encodeFunctionData,
  maxUint256,
  verifyTypedData,
} from "viem";
import { signTypedData } from "viem/actions";
import { MigrationBundle } from "../../MigrationBundle.js";
import { aTokenV2Abi } from "../../abis/aaveV2.js";
import {
  type IMigratableSupplyPosition,
  MigratableSupplyPosition,
} from "./index.js";

interface IMigratableSupplyPosition_AaveV2
  extends Omit<IMigratableSupplyPosition, "protocol"> {
  nonce: bigint;
  aToken: Token;
}

export class MigratableSupplyPosition_AaveV2
  extends MigratableSupplyPosition
  implements IMigratableSupplyPosition_AaveV2
{
  private _nonce;
  public readonly aToken;

  constructor(config: IMigratableSupplyPosition_AaveV2) {
    super({ ...config, protocol: MigratableProtocol.aaveV2 });
    this.aToken = config.aToken;
    this._nonce = config.nonce;
  }

  get nonce() {
    return this._nonce;
  }

  getMigrationTx(
    { amount, maxSharePrice, vault }: MigratableSupplyPosition.Args,
    chainId: ChainId,
    supportsSignature = true,
  ) {
    this.validateMigration({ amount });

    const bundle = new MigrationBundle(chainId);

    const user = this.user;
    const aToken = this.aToken;

    const {
      bundler3: { generalAdapter1, aaveV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV2MigrationAdapter == null)
      throw new Error("missing aaveV2MigrationAdapter address");

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

      bundle.actions.push(permitAction);

      bundle.requirements.signatures.push({
        action: permitAction,
        async sign(client: Client, account: Account = client.account!) {
          let signature = permitAction.args[4];
          if (signature != null) return signature; // action is already signed

          const typedData = getPermitTypedData(
            {
              erc20: aToken,
              owner: user,
              spender: generalAdapter1,
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
      bundle.requirements.txs.push({
        type: "erc20Approve",
        args: [aToken.address, generalAdapter1, migratedAmount],
        tx: {
          to: aToken.address,
          data: encodeFunctionData({
            abi: aTokenV2Abi,
            functionName: "approve",
            args: [generalAdapter1, migratedAmount],
          }),
        },
      });
    }

    bundle.actions.push({
      type: "erc20TransferFrom",
      args: [aToken.address, migratedAmount, aaveV2MigrationAdapter],
    });

    bundle.actions.push(
      {
        type: "aaveV2Withdraw",
        args: [this.loanToken, maxUint256, generalAdapter1],
      },
      {
        type: "erc4626Deposit",
        args: [vault, maxUint256, maxSharePrice, user],
      },
    );

    return bundle;
  }
}
