import {
  type Account,
  type Address,
  type Client,
  encodeFunctionData,
  erc20Abi,
  hexToBigInt,
  maxUint256,
  slice,
  verifyTypedData,
  zeroAddress,
} from "viem";

import {
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  NATIVE_ADDRESS,
  convexWrapperTokens,
  erc20WrapperTokens,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { Time, getValue } from "@morpho-org/morpho-ts";
import {
  APPROVE_ONLY_ONCE_TOKENS,
  MAX_TOKEN_APPROVALS,
  type MaybeDraft,
  type Operation,
  type SimulationState,
  getCurrent,
  simulateOperation,
} from "@morpho-org/simulation-sdk";

import {
  blueAbi,
  getAuthorizationTypedData,
  getDaiPermitTypedData,
  getPermit2PermitTypedData,
  getPermitTypedData,
} from "@morpho-org/blue-sdk-viem";
import { signTypedData } from "viem/actions";
import { ActionBundle, ActionBundleRequirements } from "./ActionBundle.js";
import { BundlerErrors } from "./errors.js";
import type {
  Action,
  BundlerOperation,
  TransactionRequirement,
} from "./types/index.js";

const encodeErc20Approval = (
  token: Address,
  sender: Address,
  spender: Address,
  amount: bigint,
  data: MaybeDraft<SimulationState>,
) => {
  const { chainId } = data;
  const {
    morpho,
    bundler3: { generalAdapter1 },
    permit2,
  } = getChainAddresses(chainId);

  amount = MathLib.min(
    amount,
    MAX_TOKEN_APPROVALS[chainId]?.[token] ?? maxUint256,
  );

  const txRequirements: TransactionRequirement[] = [];

  if (APPROVE_ONLY_ONCE_TOKENS[chainId]?.includes(token)) {
    const contract =
      spender === morpho
        ? "morpho"
        : spender === generalAdapter1
          ? "bundler3.generalAdapter1"
          : spender === permit2
            ? "permit2"
            : undefined;

    const currentAllowance =
      contract != null
        ? data.getHolding(sender, token).erc20Allowances[contract]
        : data.vaults[spender]?.asset === token
          ? data.getVaultUser(spender, sender).allowance
          : 0n;

    if (currentAllowance !== 0n)
      txRequirements.push({
        type: "erc20Approve",
        args: [token, spender, 0n],
        tx: {
          to: token,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, 0n],
          }),
        },
      });
  }

  txRequirements.push({
    type: "erc20Approve",
    args: [token, spender, amount],
    tx: {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      }),
    },
  });

  return txRequirements;
};

export const encodeOperation = (
  operation: BundlerOperation,
  dataBefore: MaybeDraft<SimulationState>,
  supportsSignature = true,
  index = 0,
) => {
  const { chainId } = dataBefore;
  const {
    morpho,
    bundler3: { bundler3, generalAdapter1, paraswapAdapter },
    permit2,
    wNative,
    dai,
    wstEth,
    stEth,
  } = getChainAddresses(chainId);

  const actions: Action[] = [];
  const requirements = new ActionBundleRequirements();

  let callbackBundle: ActionBundle | undefined;

  const callback = getValue(operation.args, "callback");

  const simulatedOperation = {
    ...operation,
    args: {
      ...operation.args,
      ...(callback && {
        callback: (dataBefore) => {
          callbackBundle = encodeBundle(
            callback.map((callbackOperation) => ({
              ...callbackOperation,
              // Inside a callback, the sender is forced to be the generalAdapter1.
              sender: generalAdapter1,
            })),
            getCurrent(dataBefore),
            supportsSignature,
          );

          return callback;
        },
      }),
    },
  } as Operation;

  // Operations with callbacks are encoded recursively as a side-effect of the simulation, within the callback itself.
  const dataAfter = simulateOperation(simulatedOperation, dataBefore, index);

  if (callbackBundle) {
    requirements.txs.push(...callbackBundle.requirements.txs);
    requirements.signatures.push(...callbackBundle.requirements.signatures);
  }

  const { sender } = operation;

  switch (operation.type) {
    case "Blue_SetAuthorization": {
      const {
        owner,
        isAuthorized,
        authorized,
        deadline = dataBefore.block.timestamp + Time.s.from.h(2n),
      } = operation.args;

      // Never authorize bundler3 otherwise the signature can be used independently.
      if (authorized === bundler3)
        throw new BundlerErrors.UnexpectedSignature(authorized);

      if (supportsSignature) {
        const ownerData = dataBefore.getUser(owner);

        const authorization = {
          authorizer: owner,
          authorized,
          isAuthorized,
          deadline,
          nonce: ownerData.morphoNonce,
        };

        const action: Action = {
          type: "morphoSetAuthorizationWithSig",
          args: [authorization, null, operation.skipRevert],
        };

        actions.push(action);

        requirements.signatures.push({
          action,
          async sign(client: Client, account: Account = client.account!) {
            let signature = action.args[1];
            if (signature != null) return signature;

            const typedData = getAuthorizationTypedData(authorization, chainId);
            signature = await signTypedData(client, {
              ...typedData,
              account,
            });

            await verifyTypedData({
              ...typedData,
              address: owner, // Verify against the authorization's owner.
              signature,
            });

            return (action.args[1] = signature);
          },
        });

        break;
      }

      // Signatures are not supported, fallback to standard approval.

      requirements.txs.push({
        type: "morphoSetAuthorization",
        args: [authorized, isAuthorized],
        tx: {
          to: morpho,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [authorized, isAuthorized],
          }),
        },
      });

      break;
    }
    case "Erc20_Approve": {
      // Native token cannot be approved.
      if (operation.address === NATIVE_ADDRESS) break;

      const { amount, spender } = operation.args;

      // Signatures are not supported, skip Permit2 approval.
      if (!supportsSignature && spender === permit2) break;

      requirements.txs.push(
        ...encodeErc20Approval(
          operation.address,
          sender,
          spender,
          amount,
          dataBefore,
        ),
      );

      break;
    }
    case "Erc20_Permit": {
      // Native token cannot be permitted.
      if (operation.address === NATIVE_ADDRESS) break;

      const {
        amount,
        spender,
        nonce,
        deadline = dataBefore.block.timestamp + Time.s.from.h(2n),
      } = operation.args;

      // Never permit any other address than the GeneralAdapter1 otherwise
      // the signature can be used independently.
      if (spender !== generalAdapter1)
        throw new BundlerErrors.UnexpectedSignature(spender);

      if (supportsSignature) {
        const isDai = dai != null && operation.address === dai;

        const action: Action = isDai
          ? {
              type: "permitDai",
              args: [
                sender,
                nonce,
                deadline,
                amount > 0n,
                null,
                operation.skipRevert,
              ],
            }
          : {
              type: "permit",
              args: [
                sender,
                operation.address,
                amount,
                deadline,
                null,
                operation.skipRevert,
              ],
            };

        actions.push(action);

        const tokenData = dataBefore.getToken(operation.address);

        requirements.signatures.push({
          action,
          async sign(client: Client, account: Account = client.account!) {
            let signature = action.args[4];
            if (signature != null) return signature; // action is already signed

            if (isDai) {
              const typedData = getDaiPermitTypedData(
                {
                  owner: sender,
                  spender,
                  allowance: amount,
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
                address: account.address,
                signature,
              });
            } else {
              const typedData = getPermitTypedData(
                {
                  erc20: tokenData,
                  owner: sender,
                  spender,
                  allowance: amount,
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
                address: sender, // Verify against the permit's owner.
                signature,
              });
            }

            return (action.args[4] = signature);
          },
        });

        break;
      }

      // Simple permit is not supported, fallback to standard approval.

      requirements.txs.push(
        ...encodeErc20Approval(
          operation.address,
          sender,
          spender,
          amount,
          dataBefore,
        ),
      );

      break;
    }
    case "Erc20_Permit2": {
      // Native token cannot be permitted.
      if (operation.address === NATIVE_ADDRESS) break;

      const {
        amount,
        expiration,
        nonce,
        deadline = dataBefore.block.timestamp + Time.s.from.h(2n),
      } = operation.args;

      if (supportsSignature) {
        const action: Action = {
          type: "approve2",
          args: [
            sender,
            {
              details: {
                token: operation.address,
                amount,
                nonce: Number(nonce),
                expiration: Number(expiration),
              },
              sigDeadline: deadline,
            },
            null,
            operation.skipRevert,
          ],
        };

        actions.push(action);

        requirements.signatures.push({
          action,
          async sign(client: Client, account: Account = client.account!) {
            const { details, sigDeadline } = action.args[1];

            let signature = action.args[2];
            if (signature != null) return signature; // action is already signed

            const typedData = getPermit2PermitTypedData(
              {
                // Never permit any other address than the GeneralAdapter1 otherwise
                // the signature can be used independently.
                spender: generalAdapter1,
                allowance: details.amount,
                erc20: details.token,
                nonce: details.nonce,
                deadline: sigDeadline,
                expiration: details.expiration,
              },
              chainId,
            );
            signature = await signTypedData(client, {
              ...typedData,
              account,
            });

            await verifyTypedData({
              ...typedData,
              address: sender, // Verify against the permit's owner.
              signature,
            });

            return (action.args[2] = signature);
          },
        });

        break;
      }

      // Signatures are not supported, fallback to standard approval.

      requirements.txs.push(
        ...encodeErc20Approval(
          operation.address,
          sender,
          generalAdapter1,
          amount,
          dataBefore,
        ),
      );

      break;
    }
    case "Erc20_Transfer": {
      const { amount, from, to } = operation.args;

      if (operation.address === NATIVE_ADDRESS) {
        actions.push({
          type: "nativeTransfer",
          args: [from, to, amount, operation.skipRevert],
        });

        break;
      }

      // Output transfer from the bundler.
      if (from === generalAdapter1) {
        actions.push({
          type: "erc20Transfer",
          args: [
            operation.address,
            to,
            amount,
            generalAdapter1,
            operation.skipRevert,
          ],
        });

        break;
      }

      actions.push({
        type: "erc20TransferFrom",
        args: [operation.address, amount, to, operation.skipRevert],
      });

      break;
    }
    case "Erc20_Transfer2": {
      const { amount, to } = operation.args;

      if (supportsSignature) {
        actions.push({
          type: "transferFrom2",
          args: [operation.address, amount, to, operation.skipRevert],
        });

        break;
      }

      // Signatures are not supported, fallback to standard transfer.

      actions.push({
        type: "erc20TransferFrom",
        args: [operation.address, amount, to, operation.skipRevert],
      });

      break;
    }
    case "Erc20_Wrap": {
      const { amount, owner } = operation.args;

      switch (operation.address) {
        case wNative: {
          actions.push({
            type: "wrapNative",
            args: [amount, owner, operation.skipRevert],
          });

          break;
        }
        case wstEth: {
          actions.push({
            type: "wrapStEth",
            args: [amount, owner, operation.skipRevert],
          });

          break;
        }
        case stEth: {
          actions.push({
            type: "stakeEth",
            args: [
              amount,
              MathLib.MAX_UINT_256,
              zeroAddress,
              owner,
              operation.skipRevert,
            ],
          });

          break;
        }
        default: {
          if (erc20WrapperTokens[chainId]?.has(operation.address)) {
            const underlying = getUnwrappedToken(operation.address, chainId);
            if (underlying == null)
              throw Error(`unknown wrapped token: ${operation.address}`);

            actions.push({
              type: "erc20WrapperDepositFor",
              args: [
                operation.address,
                underlying,
                amount,
                operation.skipRevert,
              ],
            });

            break;
          }

          // Convex token wrapping is executed onchain along with supplyCollateral, via depositFor.
          if (!convexWrapperTokens[chainId]?.has(operation.address))
            throw Error(`unexpected token wrap: ${operation.address}`);
        }
      }

      break;
    }
    case "Erc20_Unwrap": {
      const { amount, receiver } = operation.args;

      switch (operation.address) {
        case wNative: {
          actions.push({
            type: "unwrapNative",
            args: [amount, receiver, operation.skipRevert],
          });

          break;
        }
        case wstEth: {
          actions.push({
            type: "unwrapStEth",
            args: [amount, receiver, operation.skipRevert],
          });

          break;
        }
        default: {
          if (!erc20WrapperTokens[chainId]?.has(operation.address))
            throw Error(`unexpected token unwrap: ${operation.address}`);

          actions.push({
            type: "erc20WrapperWithdrawTo",
            args: [operation.address, receiver, amount, operation.skipRevert],
          });
        }
      }

      break;
    }
    case "Blue_Supply": {
      const {
        id,
        assets = 0n,
        shares = 0n,
        onBehalf,
        slippage = DEFAULT_SLIPPAGE_TOLERANCE,
      } = operation.args;

      // Accrue interest to calculate the expected share price.
      const market = dataBefore
        .getMarket(id)
        .accrueInterest(dataBefore.block.timestamp);

      const { assets: suppliedAssets, shares: suppliedShares } = market.supply(
        assets,
        shares,
      );
      const maxSharePrice = MathLib.mulDivUp(
        suppliedAssets,
        MathLib.wToRay(MathLib.WAD + slippage),
        suppliedShares,
      );

      actions.push({
        type: "morphoSupply",
        args: [
          market.params,
          assets,
          shares,
          maxSharePrice,
          onBehalf,
          callbackBundle?.actions ?? [],
          operation.skipRevert,
        ],
      });

      break;
    }
    case "Blue_Withdraw": {
      const {
        id,
        assets = 0n,
        shares = 0n,
        receiver,
        slippage = DEFAULT_SLIPPAGE_TOLERANCE,
      } = operation.args;

      // Accrue interest to calculate the expected share price.
      const market = dataBefore
        .getMarket(id)
        .accrueInterest(dataBefore.block.timestamp);

      const { assets: withdrawnAssets, shares: withdrawnShares } =
        market.withdraw(assets, shares);
      const minSharePrice = MathLib.mulDivUp(
        withdrawnAssets,
        MathLib.wToRay(MathLib.WAD - slippage),
        withdrawnShares,
      );

      actions.push({
        type: "morphoWithdraw",
        args: [
          market.params,
          assets,
          shares,
          minSharePrice,
          receiver,
          operation.skipRevert,
        ],
      });

      break;
    }
    case "Blue_Borrow": {
      const {
        id,
        assets = 0n,
        shares = 0n,
        receiver,
        slippage = DEFAULT_SLIPPAGE_TOLERANCE,
      } = operation.args;

      // Accrue interest to calculate the expected share price.
      const market = dataBefore
        .getMarket(id)
        .accrueInterest(dataBefore.block.timestamp);

      const { assets: borrowedAssets, shares: borrowedShares } = market.borrow(
        assets,
        shares,
      );
      const minSharePrice = MathLib.mulDivUp(
        borrowedAssets,
        MathLib.wToRay(MathLib.WAD - slippage),
        borrowedShares,
      );

      actions.push({
        type: "morphoBorrow",
        args: [
          market.params,
          assets,
          shares,
          minSharePrice,
          receiver,
          operation.skipRevert,
        ],
      });

      break;
    }
    case "Blue_Repay": {
      const {
        id,
        assets = 0n,
        shares = 0n,
        onBehalf,
        slippage = DEFAULT_SLIPPAGE_TOLERANCE,
      } = operation.args;

      // Accrue interest to calculate the expected share price.
      const market = dataBefore
        .getMarket(id)
        .accrueInterest(dataBefore.block.timestamp);

      const { assets: repaidAssets, shares: repaidShares } = market.repay(
        assets,
        shares,
      );
      const maxSharePrice = MathLib.mulDivUp(
        repaidAssets,
        MathLib.wToRay(MathLib.WAD + slippage),
        repaidShares,
      );

      actions.push({
        type: "morphoRepay",
        args: [
          market.params,
          assets,
          shares,
          maxSharePrice,
          onBehalf,
          callbackBundle?.actions ?? [],
          operation.skipRevert,
        ],
      });

      break;
    }
    case "Blue_SupplyCollateral": {
      const { id, assets, onBehalf } = operation.args;

      const { params } = dataBefore.getMarket(id);

      if (convexWrapperTokens[chainId]?.has(params.collateralToken)) {
        const underlying = getUnwrappedToken(params.collateralToken, chainId);
        if (underlying == null)
          throw Error(`unknown wrapped token: ${params.collateralToken}`);

        actions.push({
          type: "erc20WrapperDepositFor",
          args: [
            params.collateralToken,
            underlying,
            assets,
            operation.skipRevert,
          ],
        });

        break;
      }

      actions.push({
        type: "morphoSupplyCollateral",
        args: [
          params,
          assets,
          onBehalf,
          callbackBundle?.actions ?? [],
          operation.skipRevert,
        ],
      });

      break;
    }
    case "Blue_WithdrawCollateral": {
      const { id, assets, receiver } = operation.args;

      const { params } = dataBefore.getMarket(id);

      actions.push({
        type: "morphoWithdrawCollateral",
        args: [params, assets, receiver, operation.skipRevert],
      });

      break;
    }
    case "MetaMorpho_Deposit": {
      const {
        assets = 0n,
        shares = 0n,
        owner,
        slippage = DEFAULT_SLIPPAGE_TOLERANCE,
      } = operation.args;

      // Accrue interest to calculate the expected share price.
      const vault = dataBefore
        .getAccrualVault(operation.address)
        .accrueInterest(dataBefore.block.timestamp);

      if (shares === 0n) {
        const maxSharePrice = MathLib.mulDivUp(
          assets,
          MathLib.wToRay(MathLib.WAD + slippage),
          vault.toShares(assets),
        );
        actions.push({
          type: "erc4626Deposit",
          args: [
            operation.address,
            assets,
            maxSharePrice,
            owner,
            operation.skipRevert,
          ],
        });
      } else {
        const maxSharePrice = MathLib.mulDivUp(
          vault.toAssets(shares),
          MathLib.wToRay(MathLib.WAD + slippage),
          shares,
        );
        actions.push({
          type: "erc4626Mint",
          args: [
            operation.address,
            shares,
            maxSharePrice,
            owner,
            operation.skipRevert,
          ],
        });
      }

      break;
    }
    case "MetaMorpho_Withdraw": {
      const {
        assets = 0n,
        shares = 0n,
        owner,
        receiver,
        slippage = DEFAULT_SLIPPAGE_TOLERANCE,
      } = operation.args;

      // Accrue interest to calculate the expected share price.
      const vault = dataBefore
        .getAccrualVault(operation.address)
        .accrueInterest(dataBefore.block.timestamp);

      if (shares === 0n) {
        const minSharePrice = MathLib.mulDivUp(
          assets,
          MathLib.wToRay(MathLib.WAD - slippage),
          vault.toShares(assets),
        );
        actions.push({
          type: "erc4626Withdraw",
          args: [
            operation.address,
            assets,
            minSharePrice,
            receiver,
            owner,
            operation.skipRevert,
          ],
        });
      } else {
        const minSharePrice = MathLib.mulDivUp(
          vault.toAssets(shares),
          MathLib.wToRay(MathLib.WAD - slippage),
          shares,
        );
        actions.push({
          type: "erc4626Redeem",
          args: [
            operation.address,
            shares,
            minSharePrice,
            receiver,
            owner,
            operation.skipRevert,
          ],
        });
      }

      break;
    }
    case "MetaMorpho_PublicReallocate": {
      const { withdrawals, supplyMarketId } = operation.args;

      const { fee } = dataBefore.getVault(operation.address)
        .publicAllocatorConfig!;

      // Value is already accrued via another native input transfer.

      actions.push({
        type: "reallocateTo",
        args: [
          operation.address,
          fee,
          withdrawals.map(({ id, assets }) => ({
            marketParams: dataBefore.getMarket(id).params,
            amount: assets,
          })),
          dataBefore.getMarket(supplyMarketId).params,
          operation.skipRevert,
        ],
      });

      break;
    }
    case "Blue_FlashLoan": {
      const { token, assets } = operation.args;

      actions.push({
        type: "morphoFlashLoan",
        args: [
          token,
          assets,
          callbackBundle?.actions ?? [],
          operation.skipRevert,
        ],
      });

      break;
    }
    case "Paraswap_Buy": {
      if (!("swap" in operation.args))
        throw new BundlerErrors.MissingSwapData();

      if (paraswapAdapter == null)
        throw new BundlerErrors.UnexpectedAction("paraswapBuy", chainId);

      const { srcToken, swap, receiver } = operation.args;

      const limitAmountOffset = Number(swap.offsets.limitAmount);
      const limitAmount = hexToBigInt(
        slice(swap.data, limitAmountOffset, limitAmountOffset + 32),
      );

      actions.push(
        {
          type: "erc20Transfer",
          args: [
            srcToken,
            paraswapAdapter,
            limitAmount,
            generalAdapter1,
            operation.skipRevert,
          ],
        },
        {
          type: "paraswapBuy",
          args: [
            swap.to,
            swap.data,
            srcToken,
            operation.address,
            swap.offsets,
            receiver === paraswapAdapter ? generalAdapter1 : receiver,
            operation.skipRevert,
          ],
        },
        {
          type: "erc20Transfer",
          args: [
            srcToken,
            generalAdapter1,
            maxUint256,
            paraswapAdapter,
            operation.skipRevert,
          ],
        },
      );

      break;
    }
    case "Paraswap_Sell": {
      if (!("swap" in operation.args))
        throw new BundlerErrors.MissingSwapData();

      if (paraswapAdapter == null)
        throw new BundlerErrors.UnexpectedAction("paraswapBuy", chainId);

      const {
        dstToken,
        swap,
        sellEntireBalance = false,
        receiver,
      } = operation.args;

      const exactAmountOffset = Number(swap.offsets.exactAmount);
      const exactAmount = hexToBigInt(
        slice(swap.data, exactAmountOffset, exactAmountOffset + 32),
      );

      actions.push(
        {
          type: "erc20Transfer",
          args: [
            operation.address,
            paraswapAdapter,
            sellEntireBalance ? maxUint256 : exactAmount,
            generalAdapter1,
            operation.skipRevert,
          ],
        },
        {
          type: "paraswapSell",
          args: [
            swap.to,
            swap.data,
            operation.address,
            dstToken,
            sellEntireBalance,
            swap.offsets,
            receiver === paraswapAdapter ? generalAdapter1 : receiver,
            operation.skipRevert,
          ],
        },
      );

      if (!sellEntireBalance)
        actions.push({
          type: "erc20Transfer",
          args: [
            operation.address,
            generalAdapter1,
            maxUint256,
            paraswapAdapter,
            operation.skipRevert,
          ],
        });

      break;
    }
    case "Blue_Paraswap_BuyDebt": {
      if (!("swap" in operation.args))
        throw new BundlerErrors.MissingSwapData();

      if (paraswapAdapter == null)
        throw new BundlerErrors.UnexpectedAction("paraswapBuy", chainId);

      const { srcToken, id, swap, onBehalf, receiver } = operation.args;

      const { params } = dataBefore.getMarket(id);

      actions.push(
        {
          type: "erc20Transfer",
          args: [
            srcToken,
            paraswapAdapter,
            maxUint256,
            generalAdapter1,
            operation.skipRevert,
          ],
        },
        {
          type: "paraswapBuyMorphoDebt",
          args: [
            swap.to,
            swap.data,
            srcToken,
            params,
            swap.offsets,
            onBehalf,
            receiver === paraswapAdapter ? generalAdapter1 : receiver,
            operation.skipRevert,
          ],
        },
        {
          type: "erc20Transfer",
          args: [
            srcToken,
            generalAdapter1,
            maxUint256,
            paraswapAdapter,
            operation.skipRevert,
          ],
        },
      );

      break;
    }
  }

  return {
    dataAfter,
    actions,
    requirements,
  };
};

export function encodeBundle(
  operations: BundlerOperation[],
  startData: MaybeDraft<SimulationState>,
  supportsSignature = true,
) {
  const bundle = new ActionBundle([startData]);

  for (let index = 0; index < operations.length; ++index) {
    const { dataAfter, actions, requirements } = encodeOperation(
      operations[index]!,
      bundle.steps![index]!,
      supportsSignature,
      index,
    );

    bundle.steps!.push(dataAfter);

    bundle.actions.push(...actions);
    bundle.requirements.signatures.push(...requirements.signatures);
    bundle.requirements.txs.push(...requirements.txs);
  }

  return bundle;
}
