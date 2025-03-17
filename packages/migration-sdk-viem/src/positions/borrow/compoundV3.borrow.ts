import {
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { blueAbi, getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import type { Action } from "@morpho-org/bundler-sdk-viem";
import { Time, format } from "@morpho-org/morpho-ts";
import {
  type Account,
  type Address,
  type Client,
  encodeFunctionData,
  maxUint256,
  parseUnits,
  verifyTypedData,
} from "viem";
import { signTypedData } from "viem/actions";
import { MigrationBundle } from "../../MigrationBundle.js";
import { cometExtAbi } from "../../abis/compoundV3.js";
import {
  BorrowMigrationLimiter,
  MigratableProtocol,
} from "../../types/index.js";
import { getCompoundV3ManagerApprovalMessage } from "../signature/compoundV3.js";
import {
  type IMigratableBorrowPosition,
  MigratableBorrowPosition,
} from "./index.js";

interface IMigratableBorrowPosition_CompoundV3
  extends Omit<IMigratableBorrowPosition, "protocol"> {
  nonce: bigint;
  collateralPriceUsd: bigint;
  loanPriceUsd: bigint;
  /** Minimum borrow position */
  baseBorrowMin: bigint;
  cometAddress: Address;
  cometName: string;
}

export class MigratableBorrowPosition_CompoundV3
  extends MigratableBorrowPosition
  implements IMigratableBorrowPosition_CompoundV3
{
  private _nonce;
  public readonly collateralPriceUsd;
  public readonly loanPriceUsd;
  public readonly baseBorrowMin;
  public readonly cometAddress;
  public readonly cometName;

  constructor(config: IMigratableBorrowPosition_CompoundV3) {
    super({ ...config, protocol: MigratableProtocol.compoundV3 });
    this._nonce = config.nonce;
    this.collateralPriceUsd = config.collateralPriceUsd;
    this.loanPriceUsd = config.loanPriceUsd;
    this.baseBorrowMin = config.baseBorrowMin;
    this.cometAddress = config.cometAddress;
    this.cometName = config.cometName;
  }

  getLtv({
    withdrawn = 0n,
    repaid = 0n,
  }: { withdrawn?: bigint; repaid?: bigint } = {}): bigint | null {
    const totalCollateralUsd =
      ((this.collateral - withdrawn) * this.collateralPriceUsd) /
      parseUnits("1", this.collateralToken.decimals);

    const totalBorrowUsd =
      ((this.borrow - repaid) * this.loanPriceUsd) /
      parseUnits("1", this.loanToken.decimals);

    if (totalBorrowUsd <= 0n) return null;
    if (totalCollateralUsd <= 0n) return maxUint256;

    return MathLib.wDivUp(totalBorrowUsd, totalCollateralUsd);
  }

  get nonce() {
    return this._nonce;
  }

  _getMigrationTx(
    {
      collateralAmount,
      borrowAmount,
      marketTo,
      slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE,
      minSharePrice,
    }: MigratableBorrowPosition.Args,
    supportsSignature = true,
  ) {
    const user = this.user;
    const chainId = this.chainId;

    const migrationBundle = new MigrationBundle(chainId);

    const {
      morpho,
      bundler3: { generalAdapter1, compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV3MigrationAdapter == null)
      throw new Error("missing compoundV3MigrationAdapter address");

    const cometAddress = this.cometAddress;
    const cometName = this.cometName;

    let migratedBorrow = borrowAmount;

    const migrateMaxBorrow =
      this.maxRepay.limiter === BorrowMigrationLimiter.position &&
      this.maxRepay.value === migratedBorrow;
    if (migrateMaxBorrow) {
      migratedBorrow = maxUint256;
    }

    if (!migrateMaxBorrow && this.borrow - borrowAmount < this.baseBorrowMin)
      throw new Error(
        `Cannot have remaining position smaller than ${format.commas.unit(this.loanToken.symbol).of(this.baseBorrowMin, this.loanToken.decimals)}`,
      );

    if (supportsSignature) {
      const deadline = Time.timestamp() + Time.s.from.d(1n);
      const nonce = this._nonce;

      if (migratedBorrow > 0n && !this.isBundlerManaging) {
        const authorization = {
          authorizer: user,
          authorized: generalAdapter1,
          isAuthorized: true,
          deadline,
          nonce: this.morphoNonce,
        };

        const authorizeAction: Action = {
          type: "morphoSetAuthorizationWithSig",
          args: [authorization, null],
        };

        migrationBundle.actions.push(authorizeAction);

        migrationBundle.requirements.signatures.push({
          action: authorizeAction,
          async sign(client: Client, account: Account = client.account!) {
            let signature = authorizeAction.args[1];
            if (signature != null) return signature;

            const typedData = getAuthorizationTypedData(authorization, chainId);
            signature = await signTypedData(client, {
              ...typedData,
              account,
            });

            await verifyTypedData({
              ...typedData,
              address: user, // Verify against the authorization's owner.
              signature,
            });

            return (authorizeAction.args[1] = signature);
          },
        });
      }

      if (collateralAmount > 0n) {
        const allowAction: Action = {
          type: "compoundV3AllowBySig",
          args: [cometAddress, user, true, nonce, deadline, null],
        };

        migrationBundle.actions.push(allowAction);

        migrationBundle.requirements.signatures.push({
          action: allowAction,
          async sign(client: Client, account: Account = client.account!) {
            let signature = allowAction.args[5];
            if (signature != null) return signature; // action is already signed

            const typedData = getCompoundV3ManagerApprovalMessage(
              {
                name: cometName,
                instance: cometAddress,
                owner: user,
                manager: compoundV3MigrationAdapter,
                isAllowed: true,
                nonce,
                expiry: deadline,
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
      }
    } else {
      if (migratedBorrow > 0n && !this.isBundlerManaging) {
        migrationBundle.requirements.txs.push({
          type: "morphoSetAuthorization",
          args: [generalAdapter1, true],
          tx: {
            to: morpho,
            data: encodeFunctionData({
              abi: blueAbi,
              functionName: "setAuthorization",
              args: [generalAdapter1, true],
            }),
          },
        });
      }

      if (collateralAmount > 0n)
        migrationBundle.requirements.txs.push({
          type: "compoundV3ApproveManager",
          args: [compoundV3MigrationAdapter, true],
          tx: {
            to: cometAddress,
            data: encodeFunctionData({
              abi: cometExtAbi,
              functionName: "allow",
              args: [compoundV3MigrationAdapter, true],
            }),
          },
        });
    }

    const borrowActions: Action[] =
      migratedBorrow > 0n
        ? [
            {
              type: "morphoBorrow",
              args: [
                marketTo,
                migrateMaxBorrow
                  ? MathLib.wMulUp(this.borrow, MathLib.WAD + slippageFrom)
                  : migratedBorrow,
                0n,
                minSharePrice,
                compoundV3MigrationAdapter,
              ],
            },
            {
              type: "compoundV3Repay",
              args: [cometAddress, maxUint256, user],
            },
          ]
        : [];

    if (migrateMaxBorrow && slippageFrom > 0n)
      borrowActions.push(
        {
          type: "erc20Transfer",
          args: [
            marketTo.loanToken,
            generalAdapter1,
            maxUint256,
            compoundV3MigrationAdapter,
          ],
        },
        {
          type: "morphoRepay",
          args: [marketTo, maxUint256, 0n, maxUint256, user, []],
        },
      );

    if (collateralAmount > 0n) {
      const callbackActions = borrowActions.concat({
        type: "compoundV3WithdrawFrom",
        args: [
          cometAddress,
          this.collateralToken.address,
          collateralAmount,
          generalAdapter1,
        ],
      });
      migrationBundle.actions.push({
        type: "morphoSupplyCollateral",
        args: [marketTo, collateralAmount, user, callbackActions],
      });
    } else {
      migrationBundle.actions.push(...borrowActions);
    }

    return migrationBundle;
  }
}
