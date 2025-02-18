import {
  type Account,
  type Address,
  type Client,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  verifyTypedData,
  zeroAddress,
} from "viem";

import {
  ChainId,
  MathLib,
  NATIVE_ADDRESS,
  convexWrapperTokens,
  erc20WrapperTokens,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { Time, getValue } from "@morpho-org/morpho-ts";
import {
  type MaybeDraft,
  type Operation,
  type SimulationResult,
  type SimulationState,
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
import BundlerAction from "./BundlerAction.js";
import type {
  Action,
  ActionBundle,
  BundlerOperation,
  TransactionRequirement,
} from "./types/index.js";

export const APPROVE_ONLY_ONCE_TOKENS: Partial<Record<ChainId, Address[]>> = {
  [ChainId.EthMainnet]: [
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
  ],
};

const MAX_TOKEN_APPROVALS: Partial<Record<ChainId, Record<Address, bigint>>> = {
  [ChainId.EthMainnet]: {
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984": MathLib.maxUint(96), // UNI --> see https://github.com/Uniswap/governance/blob/eabd8c71ad01f61fb54ed6945162021ee419998e/contracts/Uni.sol#L154
  },
};

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
  const deadline = Time.timestamp() + Time.s.from.h(24n);
  const {
    morpho,
    bundler3: { bundler3, generalAdapter1 },
    permit2,
    wNative,
    dai,
    wstEth,
    stEth,
  } = getChainAddresses(chainId);

  let value = 0n;
  const actions: Action[] = [];
  const requirements: ActionBundle["requirements"] = {
    signatures: [],
    txs: [],
  };

  let callbackBundle: ActionBundle | undefined;

  const callback = getValue(operation.args, "callback");

  const simulatedOperation = {
    ...operation,
    args: {
      ...operation.args,
      ...(callback && {
        callback: (dataBefore) => {
          callbackBundle = encodeBundle(
            callback,
            dataBefore,
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

  const { sender, address } = operation;

  switch (operation.type) {
    case "Blue_SetAuthorization": {
      const { owner } = operation.args;

      if (supportsSignature) {
        const ownerData = dataBefore.getUser(owner);

        const authorization = {
          authorizer: owner,
          authorized: generalAdapter1,
          isAuthorized: true,
          deadline,
          nonce: ownerData.morphoNonce,
        };

        const action: Action = {
          type: "morphoSetAuthorizationWithSig",
          args: [authorization, null],
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
              address: sender, // Verify against the authorization's owner.
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

      break;
    }
    case "Erc20_Approve": {
      // Native token cannot be approved.
      if (address === NATIVE_ADDRESS) break;

      const { amount, spender } = operation.args;

      // Signatures are not supported, skip Permit2 approval.
      if (!supportsSignature && spender === permit2) break;

      requirements.txs.push(
        ...encodeErc20Approval(address, sender, spender, amount, dataBefore),
      );

      break;
    }
    case "Erc20_Permit": {
      // Native token cannot be permitted.
      if (address === NATIVE_ADDRESS) break;

      const { amount, spender, nonce } = operation.args;

      if (supportsSignature) {
        const action: Action =
          address === dai
            ? {
                type: "permitDai",
                args: [sender, nonce, deadline, true, null, spender],
              }
            : {
                type: "permit",
                args: [sender, address, amount, deadline, null, spender],
              };

        actions.push(action);

        const tokenData = dataBefore.getToken(address);

        requirements.signatures.push({
          action,
          async sign(client: Client, account: Account = client.account!) {
            let signature = action.args[4];
            if (signature != null) return signature; // action is already signed

            if (address === dai) {
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
        ...encodeErc20Approval(address, sender, spender, amount, dataBefore),
      );

      break;
    }
    case "Erc20_Permit2": {
      // Native token cannot be permitted.
      if (address === NATIVE_ADDRESS) break;

      const { amount, expiration, nonce } = operation.args;

      if (supportsSignature) {
        const action: Action = {
          type: "approve2",
          args: [
            sender,
            {
              details: {
                token: address,
                amount,
                nonce: Number(nonce),
                expiration: Number(expiration),
              },
              spender: bundler3,
              sigDeadline: deadline,
            },
            null,
          ],
        };

        actions.push(action);

        requirements.signatures.push({
          action,
          async sign(client: Client, account: Account = client.account!) {
            const { details, spender, sigDeadline } = action.args[1];

            let signature = action.args[2];
            if (signature != null) return signature; // action is already signed

            const typedData = getPermit2PermitTypedData(
              {
                spender,
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
          address,
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

      // Output transfer from the bundler.
      if (from === generalAdapter1) {
        if (address === NATIVE_ADDRESS) {
          actions.push({
            type: "nativeTransfer",
            args: [to, amount],
          });

          break;
        }

        actions.push({
          type: "erc20Transfer",
          args: [address, to, amount],
        });

        break;
      }

      // Input transfer to the bundler.
      if (to === generalAdapter1) {
        // Native token transfer is added to the call value (thus batched at the start of the bundle).
        if (address === NATIVE_ADDRESS) {
          value += amount;

          break;
        }

        actions.push({
          type: "erc20TransferFrom",
          args: [address, amount],
        });

        break;
      }

      // Any other transfer is ignored.

      break;
    }
    case "Erc20_Transfer2": {
      const { amount, from, to } = operation.args;

      // Output transfer2 from the bundler is treated like a standard output transfer.
      if (from === generalAdapter1) {
        if (address === NATIVE_ADDRESS) {
          actions.push({
            type: "nativeTransfer",
            args: [to, amount],
          });

          break;
        }

        actions.push({
          type: "erc20Transfer",
          args: [address, to, amount],
        });

        break;
      }

      // Input transfer2 to the bundler.
      if (to === generalAdapter1) {
        // Native token transfer is added to the call value (thus batched at the start of the bundle).
        if (address === NATIVE_ADDRESS) {
          value += amount;

          break;
        }

        if (supportsSignature) {
          actions.push({
            type: "transferFrom2",
            args: [address, from, amount],
          });

          break;
        }

        // Signatures are not supported, fallback to standard transfer.

        actions.push({
          type: "erc20TransferFrom",
          args: [address, amount],
        });

        break;
      }

      // Any other transfer is ignored.

      break;
    }
    case "Erc20_Wrap": {
      const { amount } = operation.args;

      switch (address) {
        case wNative: {
          actions.push({
            type: "wrapNative",
            args: [amount],
          });

          break;
        }
        case wstEth: {
          actions.push({
            type: "wrapStEth",
            args: [amount],
          });

          break;
        }
        case stEth: {
          actions.push({
            type: "stakeEth",
            args: [amount, MathLib.MAX_UINT_256, zeroAddress],
          });

          break;
        }
        default: {
          if (erc20WrapperTokens[chainId].has(address)) {
            const underlying = getUnwrappedToken(address, chainId);
            if (underlying == null)
              throw Error(`unknown wrapped token: ${address}`);

            actions.push({
              type: "erc20WrapperDepositFor",
              args: [address, underlying, amount],
            });

            break;
          }

          // Convex token wrapping is executed onchain along with supplyCollateral, via depositFor.
          if (!convexWrapperTokens[chainId].has(address))
            throw Error(`unexpected token wrap: ${address}`);
        }
      }

      break;
    }
    case "Erc20_Unwrap": {
      const { amount, receiver } = operation.args;

      switch (address) {
        case wNative: {
          actions.push({
            type: "unwrapNative",
            args: [amount],
          });

          break;
        }
        case wstEth: {
          actions.push({
            type: "unwrapStEth",
            args: [amount],
          });

          break;
        }
        default: {
          if (!erc20WrapperTokens[chainId].has(address))
            throw Error(`unexpected token unwrap: ${address}`);

          actions.push({
            type: "erc20WrapperWithdrawTo",
            args: [address, receiver, amount],
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
        slippage = 0n,
      } = operation.args;

      const { params, totalSupplyAssets, totalSupplyShares } =
        dataBefore.getMarket(id);
      const maxSharePrice =
        (totalSupplyAssets * MathLib.wToRay(MathLib.WAD + slippage)) /
        totalSupplyShares;

      actions.push({
        type: "morphoSupply",
        args: [
          params,
          assets,
          shares,
          maxSharePrice,
          onBehalf,
          callbackBundle?.actions ?? [],
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
        slippage = 0n,
      } = operation.args;

      const { params, totalSupplyAssets, totalSupplyShares } =
        dataBefore.getMarket(id);
      const minSharePrice =
        (totalSupplyAssets * MathLib.wToRay(MathLib.WAD - slippage)) /
        totalSupplyShares;

      actions.push({
        type: "morphoWithdraw",
        args: [params, assets, shares, minSharePrice, receiver],
      });

      break;
    }
    case "Blue_Borrow": {
      const {
        id,
        assets = 0n,
        shares = 0n,
        receiver,
        slippage = 0n,
      } = operation.args;

      const { params, totalBorrowAssets, totalBorrowShares } =
        dataBefore.getMarket(id);
      const minSharePrice =
        (totalBorrowAssets * MathLib.wToRay(MathLib.WAD - slippage)) /
        totalBorrowShares;

      actions.push({
        type: "morphoBorrow",
        args: [params, assets, shares, minSharePrice, receiver],
      });

      break;
    }
    case "Blue_Repay": {
      const {
        id,
        assets = 0n,
        shares = 0n,
        onBehalf,
        slippage = 0n,
      } = operation.args;

      const { params, totalBorrowAssets, totalBorrowShares } =
        dataBefore.getMarket(id);
      const maxSharePrice =
        (totalBorrowAssets * MathLib.wToRay(MathLib.WAD + slippage)) /
        totalBorrowShares;

      actions.push({
        type: "morphoRepay",
        args: [
          params,
          assets,
          shares,
          maxSharePrice,
          onBehalf,
          callbackBundle?.actions ?? [],
        ],
      });

      break;
    }
    case "Blue_SupplyCollateral": {
      const { id, assets, onBehalf } = operation.args;

      const { params } = dataBefore.getMarket(id);

      if (convexWrapperTokens[chainId].has(params.collateralToken)) {
        const underlying = getUnwrappedToken(address, chainId);
        if (underlying == null)
          throw Error(`unknown wrapped token: ${address}`);

        actions.push({
          type: "erc20WrapperDepositFor",
          args: [params.collateralToken, underlying, assets],
        });

        break;
      }

      actions.push({
        type: "morphoSupplyCollateral",
        args: [params, assets, onBehalf, callbackBundle?.actions ?? []],
      });

      break;
    }
    case "Blue_WithdrawCollateral": {
      const { id, assets, receiver } = operation.args;

      const { params } = dataBefore.getMarket(id);

      actions.push({
        type: "morphoWithdrawCollateral",
        args: [params, assets, receiver],
      });

      break;
    }
    case "MetaMorpho_Deposit": {
      const { assets = 0n, shares = 0n, owner, slippage = 0n } = operation.args;

      const vault = dataBefore.getVault(address);
      const maxSharePrice =
        (vault.totalAssets * MathLib.wToRay(MathLib.WAD + slippage)) /
        vault.totalSupply;

      if (shares === 0n)
        actions.push({
          type: "erc4626Deposit",
          args: [address, assets, maxSharePrice, owner],
        });
      else
        actions.push({
          type: "erc4626Mint",
          args: [address, shares, maxSharePrice, owner],
        });

      break;
    }
    case "MetaMorpho_Withdraw": {
      const {
        assets = 0n,
        shares = 0n,
        owner,
        receiver,
        slippage = 0n,
      } = operation.args;

      const vault = dataBefore.getVault(address);
      const minSharePrice =
        (vault.totalAssets * MathLib.wToRay(MathLib.WAD - slippage)) /
        vault.totalSupply;

      if (assets > 0n)
        actions.push({
          type: "erc4626Withdraw",
          args: [address, assets, minSharePrice, receiver, owner],
        });
      else
        actions.push({
          type: "erc4626Redeem",
          args: [address, shares, minSharePrice, receiver, owner],
        });

      break;
    }
    case "MetaMorpho_PublicReallocate": {
      const { withdrawals, supplyMarketId } = operation.args;

      const { fee } = dataBefore.getVault(address).publicAllocatorConfig!;

      // Value is already accrued via another native input transfer.

      actions.push({
        type: "reallocateTo",
        args: [
          address,
          fee,
          withdrawals.map(({ id, assets }) => ({
            marketParams: dataBefore.getMarket(id).params,
            amount: assets,
          })),
          dataBefore.getMarket(supplyMarketId).params,
        ],
      });

      break;
    }
  }

  return {
    dataAfter,
    value,
    actions,
    requirements,
  };
};

export function encodeBundle(
  operations: BundlerOperation[],
  startData: MaybeDraft<SimulationState>,
  supportsSignature = true,
): ActionBundle {
  const { chainId } = startData;

  let value = 0n;
  const actions: Action[] = [];
  const requirements: ActionBundle["requirements"] = {
    signatures: [],
    txs: [],
  };

  const steps: SimulationResult = [startData];

  for (let index = 0; index < operations.length; ++index) {
    const bundle = encodeOperation(
      operations[index]!,
      steps[index]!,
      supportsSignature,
      index,
    );

    steps.push(bundle.dataAfter);

    value += bundle.value;
    actions.push(...bundle.actions);
    requirements.signatures.push(...bundle.requirements.signatures);
    requirements.txs.push(...bundle.requirements.txs);
  }

  return {
    steps,
    actions,
    requirements,
    tx: () => BundlerAction.encodeBundle(chainId, actions, value),
  };
}
