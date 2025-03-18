import {
  UnsupportedChainIdError,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

import { migrationAddresses } from "../../config.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

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
import { morphoAaveV3Abi } from "../../abis/aaveV3Optimizer.js";
import { getMorphoAaveV3ManagerApprovalTypedData } from "../signature/aaveV3Optimizer.js";
import {
  type IMigratableSupplyPosition,
  MigratableSupplyPosition,
} from "./index.js";

interface IMigratableSupplyPosition_AaveV3Optimizer
  extends Omit<IMigratableSupplyPosition, "protocol"> {
  nonce: bigint;
  isBundlerManaging: boolean;
}

export class MigratableSupplyPosition_AaveV3Optimizer
  extends MigratableSupplyPosition
  implements IMigratableSupplyPosition_AaveV3Optimizer
{
  public readonly isBundlerManaging;
  private _nonce;

  constructor(config: IMigratableSupplyPosition_AaveV3Optimizer) {
    super({ ...config, protocol: MigratableProtocol.aaveV3Optimizer });
    this.isBundlerManaging = config.isBundlerManaging;
    this._nonce = config.nonce;
  }

  get nonce() {
    return this._nonce;
  }

  _getMigrationTx(
    { amount, maxSharePrice, vault }: MigratableSupplyPosition.Args,
    supportsSignature = true,
  ) {
    const chainId = this.chainId;
    const bundle = new MigrationBundle(chainId);

    const user = this.user;
    const {
      bundler3: { generalAdapter1, aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3OptimizerMigrationAdapter == null)
      throw new Error("missing aaveV3OptimizerMigrationAdapter address");

    const aaveV3OptimizerAddresses =
      migrationAddresses[chainId]?.[MigratableProtocol.aaveV3Optimizer];

    if (!aaveV3OptimizerAddresses) throw new UnsupportedChainIdError(chainId);

    if (!this.isBundlerManaging) {
      if (supportsSignature) {
        const deadline = Time.timestamp() + Time.s.from.d(1n);
        const nonce = this._nonce;

        const managerApprovalAction: Action = {
          type: "aaveV3OptimizerApproveManagerWithSig",
          args: [
            aaveV3OptimizerAddresses.morpho.address,
            user,
            true,
            nonce,
            deadline,
            null,
          ],
        };

        bundle.actions.push(managerApprovalAction);
        bundle.requirements.signatures.push({
          action: managerApprovalAction,
          async sign(client: Client, account: Account = client.account!) {
            let signature = managerApprovalAction.args[5];
            if (signature != null) return signature; // action is already signed

            const typedData = getMorphoAaveV3ManagerApprovalTypedData(
              {
                delegator: user,
                manager: aaveV3OptimizerMigrationAdapter,
                nonce,
                deadline,
                isAllowed: true,
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

            return (managerApprovalAction.args[5] = signature);
          },
        });
      } else {
        bundle.requirements.txs.push({
          type: "aaveV3OptimizerApproveManager",
          args: [aaveV3OptimizerMigrationAdapter, true],
          tx: {
            to: aaveV3OptimizerAddresses.morpho.address,
            data: encodeFunctionData({
              abi: morphoAaveV3Abi,
              functionName: "approveManager",
              args: [aaveV3OptimizerMigrationAdapter, true],
            }),
          },
        });
      }
    }

    let migratedAmount = amount;

    /*
      When we want to move the whole position of the user, we use MaxUint as an amount because:
      - for `aaveV3OptimizerWithdraw`, aaveV3Optimizer is taking the min between the amount and the user's balance (on pool + in p2p).
     */
    if (
      this.max.limiter === SupplyMigrationLimiter.position &&
      this.max.value <= amount
    ) {
      migratedAmount = maxUint256;
    }

    bundle.actions.push(
      {
        type: "aaveV3OptimizerWithdraw",
        args: [this.loanToken, migratedAmount, 4n, generalAdapter1],
      },
      {
        type: "erc4626Deposit",
        args: [vault, maxUint256, maxSharePrice, user],
      },
    );

    return bundle;
  }
}
