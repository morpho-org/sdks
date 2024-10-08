import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  zeroAddress,
} from "viem";

import {
  ChainId,
  MathLib,
  NATIVE_ADDRESS,
  convexWrapperTokens,
  erc20WrapperTokens,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import {
  type MaybeDraft,
  type Operation,
  type SimulationResult,
  type SimulationState,
  simulateOperation,
} from "@morpho-org/blue-sdk-viem-simulation";
import { Time, getValue } from "@morpho-org/morpho-ts";

import {
  blueAbi,
  getAuthorizationTypedData,
  getDaiPermitTypedData,
  getPermit2PermitTypedData,
  getPermitTypedData,
} from "@morpho-org/blue-sdk-viem";
import { sendTransaction, signTypedData } from "viem/actions";
import BundlerAction from "../BundlerAction.js";
import { baseBundlerAbi } from "../abis.js";
import type {
  Action,
  ActionBundle,
  BundlerOperation,
  TransactionRequirement,
} from "../types/index.js";

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
  const { morpho, bundler, permit2 } = getChainAddresses(chainId);

  amount = MathLib.min(
    amount,
    MAX_TOKEN_APPROVALS[chainId]?.[token] ?? maxUint256,
  );

  const txRequirements: TransactionRequirement[] = [];

  if (APPROVE_ONLY_ONCE_TOKENS[chainId]?.includes(token)) {
    const contract =
      spender === morpho
        ? "morpho"
        : spender === bundler
          ? "bundler"
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
    bundler,
    publicAllocator,
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
          authorized: bundler,
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
          async sign(client) {
            if (action.args[1] != null) return action.args[1];

            return (action.args[1] = await signTypedData(client, {
              account: sender,
              ...getAuthorizationTypedData(authorization, chainId),
            }));
          },
        });

        break;
      }

      // Signatures are not supported, fallback to standard approval.

      requirements.txs.push({
        type: "morphoSetAuthorization",
        args: [bundler, true],
        tx: {
          to: morpho,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [bundler, true],
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
                args: [nonce, deadline, true, null],
              }
            : {
                type: "permit",
                args: [address, amount, deadline, null],
              };

        actions.push(action);

        const tokenData = dataBefore.getToken(address);

        requirements.signatures.push({
          action,
          async sign(client) {
            if (action.args[3] != null) return action.args[3]; // action is already signed

            return (action.args[3] =
              address === dai
                ? await signTypedData(client, {
                    account: sender,
                    ...getDaiPermitTypedData(
                      {
                        owner: sender,
                        spender,
                        allowance: amount,
                        nonce,
                        deadline,
                      },
                      chainId,
                    ),
                  })
                : await signTypedData(client, {
                    account: sender,
                    ...getPermitTypedData(
                      {
                        name: tokenData.name,
                        address: tokenData.address,
                        owner: sender,
                        spender,
                        allowance: amount,
                        nonce,
                        deadline,
                      },
                      chainId,
                    ),
                  }));
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

      const { amount, spender, expiration, nonce } = operation.args;

      if (supportsSignature) {
        const action: Action = {
          type: "approve2",
          args: [
            {
              details: {
                token: address,
                amount,
                nonce: Number(nonce),
                expiration: Number(expiration),
              },
              spender,
              sigDeadline: deadline,
            },
            null,
          ],
        };

        actions.push(action);

        requirements.signatures.push({
          action,
          async sign(client) {
            const { details, spender, sigDeadline } = action.args[0];

            if (action.args[1] != null) return action.args[1]; // action is already signed

            return (action.args[1] = await signTypedData(client, {
              account: sender,
              ...getPermit2PermitTypedData(
                {
                  spender,
                  allowance: details.amount,
                  erc20: details.token,
                  nonce: details.nonce,
                  deadline: sigDeadline,
                  expiration: details.expiration,
                },
                chainId,
              ),
            }));
          },
        });

        break;
      }

      // Signatures are not supported, fallback to standard approval.

      requirements.txs.push(
        ...encodeErc20Approval(address, sender, spender, amount, dataBefore),
      );

      break;
    }
    case "Erc20_Transfer": {
      const { amount, from, to } = operation.args;

      // Output transfer from the bundler.
      if (from === bundler) {
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
      if (to === bundler) {
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
      if (from === bundler) {
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
      if (to === bundler) {
        // Native token transfer is added to the call value (thus batched at the start of the bundle).
        if (address === NATIVE_ADDRESS) {
          value += amount;

          break;
        }

        if (supportsSignature) {
          actions.push({
            type: "transferFrom2",
            args: [address, amount],
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
            args: [amount, 0n, zeroAddress],
          });

          break;
        }
        default: {
          if (erc20WrapperTokens[chainId].has(address)) {
            actions.push({
              type: "erc20WrapperDepositFor",
              args: [address, amount],
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
      const { id, assets = 0n, shares = 0n, onBehalf } = operation.args;

      const { config } = dataBefore.getMarket(id);

      // Already takes slippage into account.
      const slippageAmount =
        shares === 0n
          ? dataAfter.getPosition(onBehalf, id).supplyShares -
            dataBefore.getPosition(onBehalf, id).supplyShares
          : dataAfter.getHolding(sender, config.loanToken).balance -
            dataBefore.getHolding(sender, config.loanToken).balance;

      actions.push({
        type: "morphoSupply",
        args: [
          config,
          assets,
          shares,
          slippageAmount,
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
        onBehalf,
        receiver,
      } = operation.args;

      const { config } = dataBefore.getMarket(id);

      // Already takes slippage into account.
      const slippageAmount =
        shares === 0n
          ? dataBefore.getPosition(onBehalf, id).supplyShares -
            dataAfter.getPosition(onBehalf, id).supplyShares
          : dataBefore.getHolding(sender, config.loanToken).balance -
            dataAfter.getHolding(sender, config.loanToken).balance;

      actions.push({
        type: "morphoWithdraw",
        args: [config, assets, shares, slippageAmount, receiver],
      });

      break;
    }
    case "Blue_Borrow": {
      const {
        id,
        assets = 0n,
        shares = 0n,
        onBehalf,
        receiver,
      } = operation.args;

      const { config } = dataBefore.getMarket(id);

      // Already takes slippage into account.
      const slippageAmount =
        shares === 0n
          ? dataAfter.getPosition(onBehalf, id).borrowShares -
            dataBefore.getPosition(onBehalf, id).borrowShares
          : dataAfter.getHolding(sender, config.loanToken).balance -
            dataBefore.getHolding(sender, config.loanToken).balance;

      actions.push({
        type: "morphoBorrow",
        args: [config, assets, shares, slippageAmount, receiver],
      });

      break;
    }
    case "Blue_Repay": {
      const { id, assets = 0n, shares = 0n, onBehalf } = operation.args;

      const { config } = dataBefore.getMarket(id);

      // Already takes slippage into account.
      const slippageAmount =
        shares === 0n
          ? dataBefore.getPosition(onBehalf, id).borrowShares -
            dataAfter.getPosition(onBehalf, id).borrowShares
          : dataBefore.getHolding(sender, config.loanToken).balance -
            dataAfter.getHolding(sender, config.loanToken).balance;

      actions.push({
        type: "morphoRepay",
        args: [
          config,
          assets,
          shares,
          slippageAmount,
          onBehalf,
          callbackBundle?.actions ?? [],
        ],
      });

      break;
    }
    case "Blue_SupplyCollateral": {
      const { id, assets, onBehalf } = operation.args;

      const { config } = dataBefore.getMarket(id);

      if (convexWrapperTokens[chainId].has(config.collateralToken)) {
        actions.push({
          type: "erc20WrapperDepositFor",
          args: [config.collateralToken, assets],
        });

        break;
      }

      actions.push({
        type: "morphoSupplyCollateral",
        args: [config, assets, onBehalf, callbackBundle?.actions ?? []],
      });

      break;
    }
    case "Blue_WithdrawCollateral": {
      const { id, assets, receiver } = operation.args;

      const { config } = dataBefore.getMarket(id);

      actions.push({
        type: "morphoWithdrawCollateral",
        args: [config, assets, receiver],
      });

      break;
    }
    case "MetaMorpho_Deposit": {
      const { assets = 0n, shares = 0n, owner } = operation.args;

      if (shares === 0n) {
        // Already takes slippage into account.
        const expectedShares =
          dataAfter.getHolding(owner, address).balance -
          dataBefore.getHolding(owner, address).balance;

        actions.push({
          type: "erc4626Deposit",
          args: [address, assets, expectedShares, owner],
        });
      } else {
        const vaultConfig = dataBefore.getVault(address);

        // Already takes slippage into account.
        const expectedAssets =
          dataBefore.getHolding(sender, vaultConfig.asset).balance -
          dataAfter.getHolding(sender, vaultConfig.asset).balance;

        actions.push({
          type: "erc4626Mint",
          args: [address, shares, expectedAssets, owner],
        });
      }

      break;
    }
    case "MetaMorpho_Withdraw": {
      const { assets = 0n, shares = 0n, owner, receiver } = operation.args;

      if (assets > 0n) {
        // Already takes slippage into account.
        const expectedShares =
          dataBefore.getHolding(owner, address).balance -
          dataAfter.getHolding(owner, address).balance;

        actions.push({
          type: "erc4626Withdraw",
          args: [address, assets, expectedShares, receiver, owner],
        });
      } else {
        const vaultConfig = dataBefore.getVault(address);

        // Already takes slippage into account.
        const expectedAssets =
          dataAfter.getHolding(receiver, vaultConfig.asset).balance -
          dataBefore.getHolding(receiver, vaultConfig.asset).balance;

        actions.push({
          type: "erc4626Redeem",
          args: [address, shares, expectedAssets, receiver, owner],
        });
      }

      break;
    }
    case "MetaMorpho_PublicReallocate": {
      const { withdrawals, supplyMarketId } = operation.args;

      if (publicAllocator == null)
        throw Error(`unknown public allocator on chain ${chainId}`);

      const { fee } = dataBefore.getVault(address).publicAllocatorConfig!;

      // Value is already accrued via another native input transfer.

      actions.push({
        type: "reallocateTo",
        args: [
          publicAllocator,
          address,
          fee,
          withdrawals.map(({ id, assets }) => ({
            marketParams: dataBefore.getMarket(id).config,
            amount: assets,
          })),
          dataBefore.getMarket(supplyMarketId).config,
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
  const { bundler } = getChainAddresses(chainId);

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

  sendTransaction;

  return {
    steps,
    actions,
    requirements,
    tx: () => ({
      to: bundler,
      value,
      data: encodeFunctionData({
        abi: baseBundlerAbi,
        functionName: "multicall",
        args: [actions.map(BundlerAction.encode)],
      }),
    }),
  };
}
