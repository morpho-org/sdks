import {
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  type Token,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import {
  blueAbi,
  getAuthorizationTypedData,
  getPermitTypedData,
} from "@morpho-org/blue-sdk-viem";
import type {
  Action,
  SignatureRequirement,
} from "@morpho-org/bundler-sdk-viem";
import BundlerAction from "@morpho-org/bundler-sdk-viem/src/BundlerAction.js";
import { Time } from "@morpho-org/morpho-ts";
import {
  type Account,
  type Client,
  encodeFunctionData,
  maxUint256,
  parseUnits,
  verifyTypedData,
} from "viem";
import { signTypedData } from "viem/actions";
import { aTokenV2Abi } from "../../abis/aaveV2.js";
import type {
  MigrationBundle,
  MigrationTransactionRequirement,
} from "../../types/actions.js";
import {
  BorrowMigrationLimiter,
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";
import {
  type IMigratableBorrowPosition,
  MigratableBorrowPosition,
} from "./index.js";

interface IMigratableBorrowPosition_AaveV2
  extends Omit<IMigratableBorrowPosition, "protocol"> {
  nonce: bigint;
  aToken: Token;
  collateralPriceEth: bigint;
  loanPriceEth: bigint;
}

export class MigratableBorrowPosition_AaveV2
  extends MigratableBorrowPosition
  implements IMigratableBorrowPosition_AaveV2
{
  private _nonce;
  public readonly aToken;
  public readonly collateralPriceEth;
  public readonly loanPriceEth;

  constructor(config: IMigratableBorrowPosition_AaveV2) {
    super({ ...config, protocol: MigratableProtocol.aaveV2 });
    this.aToken = config.aToken;
    this._nonce = config.nonce;
    this.collateralPriceEth = config.collateralPriceEth;
    this.loanPriceEth = config.loanPriceEth;
  }

  getLtv({
    withdrawn = 0n,
    repaid = 0n,
  }: { withdrawn?: bigint; repaid?: bigint } = {}): bigint | null {
    const totalCollateralEth =
      ((this.collateral - withdrawn) * this.collateralPriceEth) /
      parseUnits("1", this.collateralToken.decimals);

    const totalBorrowEth =
      ((this.borrow - repaid) * this.loanPriceEth) /
      parseUnits("1", this.loanToken.decimals);

    if (totalBorrowEth <= 0n) return null;
    if (totalCollateralEth <= 0n) return maxUint256;

    return MathLib.wDivUp(totalBorrowEth, totalCollateralEth);
  }

  get nonce() {
    return this._nonce;
  }

  getMigrationTx(
    {
      collateralAmount,
      borrowAmount,
      marketTo,
      slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE,
      minSharePrice,
    }: MigratableBorrowPosition.Args,
    supportsSignature = true,
  ): MigrationBundle {
    if (
      marketTo.collateralToken !== this.collateralToken.address ||
      marketTo.loanToken !== this.loanToken.address
    )
      throw new Error("Invalid market");

    const signRequirements: SignatureRequirement[] = [];
    const txRequirements: MigrationTransactionRequirement[] = [];
    const actions: Action[] = [];

    const user = this.user;
    const chainId = this.chainId;

    const {
      morpho,
      bundler3: { generalAdapter1, aaveV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV2MigrationAdapter == null)
      throw new Error("missing aaveV2MigrationAdapter address");

    const aToken = this.aToken;

    let migratedBorrow = borrowAmount;
    let migratedCollateral = collateralAmount;

    const migrateMaxBorrow =
      this.maxRepay.limiter === BorrowMigrationLimiter.position &&
      this.maxRepay.value === migratedBorrow;
    if (migrateMaxBorrow) {
      migratedBorrow = maxUint256;
    }

    const migrateMaxCollateral =
      this.maxWithdraw.limiter === SupplyMigrationLimiter.position &&
      this.maxWithdraw.value === migratedCollateral;
    if (migrateMaxCollateral) {
      migratedCollateral = maxUint256;
    }

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

        actions.push(authorizeAction);

        signRequirements.push({
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

      if (migratedCollateral > 0n) {
        const permitAction: Action = {
          type: "permit",
          args: [user, aToken.address, migratedCollateral, deadline, null],
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
                spender: generalAdapter1,
                allowance: migratedCollateral,
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
      }
    } else {
      if (migratedBorrow > 0n && !this.isBundlerManaging) {
        txRequirements.push({
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

      if (migratedCollateral > 0n)
        txRequirements.push({
          type: "erc20Approve",
          args: [aToken.address, generalAdapter1, migratedCollateral],
          tx: {
            to: aToken.address,
            data: encodeFunctionData({
              abi: aTokenV2Abi,
              functionName: "approve",
              args: [generalAdapter1, migratedCollateral],
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
                aaveV2MigrationAdapter,
              ],
            },
            {
              type: "aaveV2Repay",
              args: [this.loanToken.address, maxUint256, user, 2n],
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
            aaveV2MigrationAdapter,
          ],
        },
        {
          type: "morphoRepay",
          args: [marketTo, maxUint256, 0n, maxUint256, user, []],
        },
      );

    if (migratedCollateral > 0n) {
      const callbackActions = borrowActions.concat(
        {
          type: "erc20TransferFrom",
          args: [aToken.address, migratedCollateral, aaveV2MigrationAdapter],
        },
        {
          type: "aaveV2Withdraw",
          args: [
            this.collateralToken.address,
            migratedCollateral,
            generalAdapter1,
          ],
        },
      );
      actions.push(
        {
          type: "morphoSupplyCollateral",
          args: [marketTo, collateralAmount, user, callbackActions],
        },
        {
          type: "erc20Transfer",
          args: [
            migrateMaxCollateral
              ? this.collateralToken.address
              : this.aToken.address,
            user,
            maxUint256,
          ],
        },
      );
      if (migrateMaxCollateral) actions.push();
    } else {
      actions.push(...borrowActions);
    }

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
