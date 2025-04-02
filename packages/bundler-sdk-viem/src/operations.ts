import {
  type Address,
  DEFAULT_SLIPPAGE_TOLERANCE,
  type MarketId,
  MarketUtils,
  MathLib,
  NATIVE_ADDRESS,
  erc20WrapperTokens,
  getChainAddresses,
  getUnwrappedToken,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import {
  bigIntComparator,
  entries,
  getLast,
  getValue,
  keys,
} from "@morpho-org/morpho-ts";
import {
  type Erc20Operations,
  type MaybeDraft,
  type Operation,
  type Operations,
  type PublicAllocatorOptions,
  type SimulationResult,
  type SimulationState,
  handleOperation,
  handleOperations,
  produceImmutable,
  simulateOperation,
  simulateOperations,
} from "@morpho-org/simulation-sdk";

import { isAddressEqual, maxUint256 } from "viem";
import { BundlerErrors } from "./errors.js";
import type {
  BundlerOperation,
  CallbackBundlerOperation,
  InputBundlerOperation,
} from "./types/index.js";

/**
 * The default target utilization above which the shared liquidity algorithm is triggered (scaled by WAD).
 */
export const DEFAULT_SUPPLY_TARGET_UTILIZATION = 90_5000000000000000n;

export interface BundlingOptions {
  withSimplePermit?: Set<Address>;
  publicAllocatorOptions?: PublicAllocatorOptions & {
    /**
     * The target utilization of each market above which the shared liquidity algorithm is triggered (scaled by WAD).
     */
    supplyTargetUtilization?: Record<MarketId, bigint | undefined>;

    /**
     * The default target utilization above which the shared liquidity algorithm is triggered (scaled by WAD).
     * @default 90.5%
     */
    defaultSupplyTargetUtilization?: bigint;
  };
  getRequirementOperations?: (
    requiredTokenAmounts: {
      token: Address;
      required: bigint;
    }[],
  ) => BundlerOperation[];
}

export const populateInputTransfer = (
  { address, args: { amount, from } }: Operations["Erc20_Transfer"],
  data: MaybeDraft<SimulationState>,
  { hasSimplePermit = false }: { hasSimplePermit?: boolean } = {},
): Exclude<BundlerOperation, CallbackBundlerOperation>[] => {
  const {
    bundler3: { bundler3, generalAdapter1 },
    permit2,
  } = getChainAddresses(data.chainId);

  // If native token, it is expected to be sent along as call value.
  if (address === NATIVE_ADDRESS)
    return [
      {
        type: "Erc20_Transfer",
        sender: from,
        address,
        args: {
          amount,
          from,
          to: generalAdapter1,
        },
      },
    ];

  const { erc20Allowances, permit2BundlerAllowance, erc2612Nonce } =
    data.getHolding(from, address);

  // ERC20 allowance to the bundler is enough, consume it.
  if (erc20Allowances["bundler3.generalAdapter1"] >= amount)
    return [
      {
        type: "Erc20_Transfer",
        sender: generalAdapter1,
        address,
        args: {
          amount,
          from,
          to: generalAdapter1,
        },
      },
    ];

  const operations: Exclude<BundlerOperation, CallbackBundlerOperation>[] = [];

  // Try using simple permit.
  const useSimplePermit =
    erc2612Nonce != null &&
    (data.tryGetVault(address) != null || // MetaMorpho vaults implement EIP-2612.
      hasSimplePermit);
  const useSimpleTransfer =
    permit2 == null ||
    // Token is permissioned and Permit2 may not be authorized so Permit2 cannot be used.
    !!permissionedWrapperTokens[data.chainId]?.has(address) ||
    !!permissionedBackedTokens[data.chainId]?.has(address);

  if (useSimplePermit)
    operations.push({
      type: "Erc20_Permit",
      sender: from,
      address,
      args: {
        amount,
        spender: generalAdapter1,
        nonce: erc2612Nonce,
      },
    });
  else if (useSimpleTransfer)
    operations.push({
      type: "Erc20_Approve",
      sender: from,
      address,
      args: {
        amount,
        spender: generalAdapter1,
      },
    });

  if (useSimplePermit || useSimpleTransfer)
    operations.push({
      type: "Erc20_Transfer",
      sender: generalAdapter1,
      address,
      args: {
        amount,
        from,
        to: generalAdapter1,
      },
    });
  // Simple permit is not supported: fallback to Permit2.
  else {
    if (erc20Allowances.permit2 < amount)
      operations.push({
        type: "Erc20_Approve",
        sender: from,
        address,
        args: {
          amount: MathLib.MAX_UINT_160, // Always approve infinite.
          spender: permit2,
        },
      });

    if (
      permit2BundlerAllowance.amount < amount ||
      permit2BundlerAllowance.expiration < data.block.timestamp
    )
      operations.push({
        type: "Erc20_Permit2",
        sender: from,
        address,
        args: {
          amount,
          expiration: MathLib.MAX_UINT_48, // Always approve indefinitely.
          nonce: permit2BundlerAllowance.nonce,
        },
      });

    operations.push({
      type: "Erc20_Transfer2",
      sender: bundler3,
      address,
      args: {
        amount,
        from,
        to: generalAdapter1,
      },
    });
  }

  return operations;
};

/**
 * Simulates the input operation on the given simulation data with args tweaked so the bundler operates on behalf of the sender.
 * Then, populates a bundle of operations made of:
 * - required approvals to the bundler
 * - required input transfers to the bundler
 * - required token wrapping
 * - the given operation
 * @param inputOperation The input operation to populate a bundle for.
 * @param data The simulation data to determine the required steps of the bundle to populate. If the provided simulation data is the result of a simulation
 * of an already populated bundle, the `Transfer` and `Wrap` operation are only populated if required.
 * @param wrapSlippage The slippage simulated during wraps. Should never be 0.
 * @return The bundle of operations to optimize and skim before being encoded.
 */
export const populateSubBundle = (
  inputOperation: InputBundlerOperation,
  data: MaybeDraft<SimulationState>,
  options: BundlingOptions = {},
) => {
  const { sender } = inputOperation;
  const {
    morpho,
    bundler3: { bundler3, generalAdapter1 },
  } = getChainAddresses(data.chainId);
  const {
    withSimplePermit = new Set(),
    publicAllocatorOptions,
    getRequirementOperations,
  } = options;

  const operations: Exclude<BundlerOperation, CallbackBundlerOperation>[] = [];

  const wrappedToken =
    inputOperation.type === "Erc20_Wrap"
      ? data.getWrappedToken(inputOperation.address)
      : undefined;

  const isErc20Wrapper =
    !!wrappedToken &&
    !!erc20WrapperTokens[data.chainId]?.has(wrappedToken.address);

  // Transform input operation to act on behalf of the sender, via the bundler.
  const mainOperation = produceImmutable(inputOperation, (draft) => {
    draft.sender = generalAdapter1;

    // Redirect MetaMorpho operation owner.
    switch (draft.type) {
      case "Erc20_Wrap": {
        // ERC20Wrapper are skipped because tokens are sent to the caller, not the bundler.
        if (isErc20Wrapper) {
          draft.args.owner = sender;
          break;
        }
      }
      case "MetaMorpho_Deposit":
      case "MetaMorpho_Withdraw":
        // Only if sender is owner otherwise the owner would be lost.
        if (draft.args.owner === sender) draft.args.owner = generalAdapter1;
    }

    // Redirect operation targets.
    switch (draft.type) {
      case "Blue_Borrow":
      case "Blue_Withdraw":
      case "Blue_WithdrawCollateral":
        draft.args.onBehalf = sender;
      case "MetaMorpho_Withdraw":
        // Only if sender is receiver otherwise the receiver would be lost.
        if (draft.args.receiver === sender)
          draft.args.receiver = generalAdapter1;
    }
  });

  const needsBundlerAuthorization =
    mainOperation.type === "Blue_Borrow" ||
    mainOperation.type === "Blue_Withdraw" ||
    mainOperation.type === "Blue_WithdrawCollateral";
  if (needsBundlerAuthorization && !data.getUser(sender).isBundlerAuthorized)
    operations.push({
      type: "Blue_SetAuthorization",
      sender: bundler3,
      address: morpho,
      args: {
        owner: sender,
        isAuthorized: true,
        authorized: generalAdapter1,
      },
    });

  // Reallocate liquidity if necessary.
  if (
    !!publicAllocatorOptions?.enabled &&
    (mainOperation.type === "Blue_Borrow" ||
      mainOperation.type === "Blue_Withdraw")
  ) {
    const market = data
      .getMarket(mainOperation.args.id)
      .accrueInterest(data.block.timestamp);

    const borrowedAssets =
      mainOperation.type === "Blue_Borrow"
        ? (mainOperation.args.assets ??
          market.toBorrowAssets(mainOperation.args.shares))
        : 0n;
    const withdrawnAssets =
      mainOperation.type === "Blue_Withdraw"
        ? (mainOperation.args.assets ??
          market.toSupplyAssets(mainOperation.args.shares))
        : 0n;

    const newTotalSupplyAssets = market.totalSupplyAssets - withdrawnAssets;
    const newTotalBorrowAssets = market.totalBorrowAssets + borrowedAssets;

    const reallocations: {
      [vault: Address]: {
        id: MarketId;
        assets: bigint;
      }[];
    } = {};

    const supplyTargetUtilization =
      publicAllocatorOptions.supplyTargetUtilization?.[market.params.id] ??
      publicAllocatorOptions.defaultSupplyTargetUtilization ??
      DEFAULT_SUPPLY_TARGET_UTILIZATION;

    if (
      MarketUtils.getUtilization({
        totalSupplyAssets: newTotalSupplyAssets,
        totalBorrowAssets: newTotalBorrowAssets,
      }) > supplyTargetUtilization
    ) {
      // Liquidity is insufficient: trigger a public reallocation and try to have a resulting utilization as low as possible, above the target.
      // Solve: newTotalBorrowAssets / (newTotalSupplyAssets + reallocatedAssets) = supplyTargetUtilization
      // We first try to find public reallocations that respect every markets targets.
      // If this is not enough, the first market to be pushed above target is the supply market. Then we fully withdraw from every market.
      let requiredAssets =
        supplyTargetUtilization === 0n
          ? MathLib.MAX_UINT_160
          : MathLib.wDivDown(newTotalBorrowAssets, supplyTargetUtilization) -
            newTotalSupplyAssets;

      let { withdrawals, data: simulationStatePostFriendlyReallocation } =
        data.getMarketPublicReallocations(market.id, publicAllocatorOptions);

      const marketPostFriendlyReallocation =
        simulationStatePostFriendlyReallocation.getMarket(market.id);

      if (
        marketPostFriendlyReallocation.totalBorrowAssets + borrowedAssets >
        marketPostFriendlyReallocation.totalSupplyAssets - withdrawnAssets
      ) {
        // If the "friendly" reallocations are not enough, we fully withdraw from every market.

        requiredAssets = newTotalBorrowAssets - newTotalSupplyAssets;

        ({ withdrawals } = data.getMarketPublicReallocations(market.id, {
          ...publicAllocatorOptions,
          defaultMaxWithdrawalUtilization: MathLib.WAD,
          maxWithdrawalUtilization: {},
        }));
      }

      for (const { vault, ...withdrawal } of withdrawals) {
        const vaultReallocations = (reallocations[vault] ??= []);

        if (withdrawal.assets > requiredAssets) {
          vaultReallocations.push({
            ...withdrawal,
            assets: requiredAssets,
          });

          break;
        }

        requiredAssets -= withdrawal.assets;
        vaultReallocations.push(withdrawal);
      }

      // TODO: we know there are no unwrap native in the middle
      // of the bundle so we are certain we need to add an input transfer.
      // This could be handled by `simulateRequiredTokenAmounts` below.
      const fees = keys(reallocations).reduce(
        (total, vault) =>
          total + data.getVault(vault).publicAllocatorConfig!.fee,
        0n,
      );

      // Native input transfer of all fees.
      if (fees > 0n)
        operations.push({
          type: "Erc20_Transfer",
          sender,
          address: NATIVE_ADDRESS,
          args: {
            amount: fees,
            from: sender,
            to: bundler3,
          },
        });
    }

    // Reallocate each vault.
    operations.push(
      ...Object.entries(reallocations).map(
        ([vault, vaultWithdrawals]) =>
          ({
            type: "MetaMorpho_PublicReallocate",
            sender: bundler3,
            address: vault,
            args: {
              // Reallocation withdrawals must be sorted by market id in ascending alphabetical order.
              withdrawals: vaultWithdrawals.sort(({ id: idA }, { id: idB }) =>
                idA > idB ? 1 : -1,
              ),
              supplyMarketId: market.id,
            },
          }) as Operations["MetaMorpho_PublicReallocate"],
      ),
    );
  }

  const callback = getValue(mainOperation.args, "callback");

  const simulatedOperation = {
    ...mainOperation,
    args: {
      ...mainOperation.args,
      ...(callback && {
        callback: (data) => {
          const operations = callback.flatMap((inputOperation) => {
            const subBundleOperations = populateSubBundle(
              inputOperation,
              data,
              options,
            );

            // Handle to mutate data (not simulate).
            handleBundlerOperations(subBundleOperations, data);

            return subBundleOperations;
          });

          (mainOperation as CallbackBundlerOperation).args.callback =
            operations;

          return [];
        },
      }),
    },
  } as Operation;

  // Operations with callbacks are populated recursively as a side-effect of the simulation, within the callback itself.
  let requiredTokenAmounts = simulateRequiredTokenAmounts(
    (operations as Operation[]).concat([simulatedOperation]),
    data,
  );

  const allOperations = (operations as BundlerOperation[]).concat([
    mainOperation,
  ]);

  // Skip approvals/transfers if operation only uses available balances (via maxUint256).
  if (
    ("amount" in mainOperation.args &&
      mainOperation.args.amount === maxUint256) ||
    ("assets" in mainOperation.args &&
      mainOperation.args.assets === maxUint256) ||
    ("shares" in mainOperation.args && mainOperation.args.shares === maxUint256)
  ) {
    if (mainOperation.type === "MetaMorpho_Withdraw")
      mainOperation.args.owner = generalAdapter1;

    return allOperations;
  }

  const requirementOperations =
    getRequirementOperations?.(requiredTokenAmounts) ?? [];
  requiredTokenAmounts = simulateRequiredTokenAmounts(
    requirementOperations
      .concat(allOperations)
      .map((operation) => getSimulatedBundlerOperation(operation)),
    data,
  );

  // Append required input transfers.
  requiredTokenAmounts.forEach(({ token, required }) => {
    requirementOperations.push(
      ...populateInputTransfer(
        {
          type: "Erc20_Transfer",
          sender: generalAdapter1,
          address: token,
          args: {
            amount: required,
            from: sender,
            to: generalAdapter1,
          },
        },
        data,
        { hasSimplePermit: withSimplePermit.has(token) },
      ),
    );
  });

  return requirementOperations.concat(allOperations);
};

/**
 * Merges unnecessary duplicate `Erc20_Approve`, `Erc20_Transfer` and `Erc20_Wrap`.
 * Also redirects `Blue_Borrow|Withdraw|WithdrawCollateral` & `MetaMorpho_Withdraw` operations from the bundler to the receiver,
 * as long as the tokens received (possibly ERC4626 shares) are not used afterwards in the bundle.
 * For all the other remaining tokens, appends `Erc20_Transfer` operations to the bundle, from the bundler to the receiver.
 * @param operations The bundle to optimize.
 * @param startData The start data from which to simulate th bundle.
 * @param receiver The receiver of skimmed tokens.
 * @param unwrapTokens The set of tokens to unwrap before transferring to the receiver.
 * @param unwrapSlippage The slippage simulated during unwraps. Should never be 0.
 * @return The optimized bundle.
 */
export const finalizeBundle = (
  operations: BundlerOperation[],
  startData: SimulationState,
  receiver: Address,
  unwrapTokens = new Set<Address>(),
  unwrapSlippage = DEFAULT_SLIPPAGE_TOLERANCE,
) => {
  const nbOperations = operations.length;
  if (nbOperations === 0) return operations;

  const {
    bundler3: { bundler3, generalAdapter1 },
  } = getChainAddresses(startData.chainId);

  if (
    isAddressEqual(receiver, bundler3) ||
    isAddressEqual(receiver, generalAdapter1)
  )
    throw Error(`receiver is bundler`);

  const approvals = [] as Operations["Erc20_Approve"][];
  const permits = [] as Operations["Erc20_Permit"][];
  const permit2s = [] as Operations["Erc20_Permit2"][];
  const inputTransfers = [] as Operations["Erc20_Transfer"][];
  const inputTransfer2s = [] as Operations["Erc20_Transfer2"][];
  const others = [] as BundlerOperation[];

  // TODO input transfers can be merged to the right-most position where transferred assets are still not used
  // Merge together approvals, permits, permit2s & input transfers.
  operations.forEach((operation) => {
    switch (operation.type) {
      case "Erc20_Approve": {
        const duplicateApproval = approvals.find(
          (approval) =>
            approval.address === operation.address &&
            approval.sender === operation.sender &&
            approval.args.spender === operation.args.spender,
        );

        if (duplicateApproval == null) return approvals.push(operation);

        duplicateApproval.args.amount += operation.args.amount;

        break;
      }
      case "Erc20_Permit": {
        const duplicatePermit = permits.find(
          (permit) =>
            permit.address === operation.address &&
            permit.sender === operation.sender &&
            permit.args.spender === operation.args.spender,
        );

        if (duplicatePermit == null) {
          const lastPermit = permits.findLast(
            (permit) =>
              permit.address === operation.address &&
              permit.sender === operation.sender,
          );

          if (lastPermit) operation.args.nonce = lastPermit.args.nonce + 1n;

          permits.push(operation);
        } else duplicatePermit.args.amount += operation.args.amount;

        break;
      }
      case "Erc20_Permit2": {
        const duplicatePermit2 = permit2s.find(
          (permit2) =>
            permit2.address === operation.address &&
            permit2.sender === operation.sender,
        );

        if (duplicatePermit2 == null) {
          const lastPermit2 = permit2s.findLast(
            (permit2) =>
              permit2.address === operation.address &&
              permit2.sender === operation.sender,
          );

          if (lastPermit2) operation.args.nonce = lastPermit2.args.nonce + 1n;

          permit2s.push(operation);
        } else duplicatePermit2.args.amount += operation.args.amount;

        break;
      }
      case "Erc20_Transfer": {
        const {
          address,
          sender,
          args: { amount, from, to },
        } = operation;

        if (
          from !== generalAdapter1 &&
          to === generalAdapter1 &&
          !erc20WrapperTokens[startData.chainId]?.has(address)
        ) {
          const duplicateTransfer = inputTransfers.find(
            (transfer) =>
              transfer.address === address &&
              transfer.sender === sender &&
              transfer.args.from === from,
          );

          if (
            duplicateTransfer == null ||
            // Don't merge the input transfer if from didn't have enough balance at the start.
            startData.getHolding(from, address).balance < amount
          )
            return inputTransfers.push(operation);

          duplicateTransfer.args.amount += amount;

          return;
        }

        others.push(operation);

        break;
      }
      case "Erc20_Transfer2": {
        const {
          address,
          sender,
          args: { amount, from, to },
        } = operation;

        if (from !== generalAdapter1 && to === generalAdapter1) {
          const duplicateTransfer2 = inputTransfer2s.find(
            (transfer) =>
              transfer.address === address &&
              transfer.sender === sender &&
              transfer.args.from === from,
          );

          if (
            duplicateTransfer2 == null ||
            // Don't merge the input transfer if from didn't have enough balance at the start.
            startData.getHolding(from, address).balance < amount
          )
            return inputTransfer2s.push(operation);

          duplicateTransfer2.args.amount += amount;

          return;
        }

        others.push(operation);

        break;
      }
      // Cannot factorize public reallocations because the liquidity may not always be available before other operations.
      default:
        others.push(operation);
    }
  });

  operations = [
    approvals,
    permits,
    permit2s,
    inputTransfers,
    inputTransfer2s,
    others,
  ].flat(1);

  let steps = simulateBundlerOperations(operations, startData);

  // Redirect MetaMorpho deposits.
  operations.forEach((operation, index) => {
    if (
      operation.type !== "MetaMorpho_Deposit" ||
      operation.args.owner !== generalAdapter1
    )
      return;

    const token = operation.address;

    // shares are not defined when depositing assets, so we rely on simulation steps.
    const shares =
      steps[index + 1]!.getHolding(generalAdapter1, token).balance -
      steps[index]!.getHolding(generalAdapter1, token).balance;

    if (
      steps
        .slice(index + 2)
        .some(
          (step) => step.getHolding(generalAdapter1, token).balance < shares,
        )
    )
      // If the bundler's balance is at least once lower than assets, the bundler does need these assets.
      return;

    operation.args.owner = receiver;
  });

  // Redirect borrows, withdrawals & MetaMorpho withdrawals.
  operations.forEach((operation, index) => {
    let token: Address;
    switch (operation.type) {
      case "Blue_Borrow":
      case "Blue_Withdraw":
        token = startData.getMarket(operation.args.id).params.loanToken;
        break;
      case "Blue_WithdrawCollateral":
        token = startData.getMarket(operation.args.id).params.collateralToken;
        break;
      case "MetaMorpho_Withdraw":
        token = startData.getVault(operation.address).asset;
        break;
      default:
        return;
    }

    if (operation.args.receiver !== generalAdapter1 || unwrapTokens.has(token))
      return;

    // assets are not defined when using shares, so we rely on simulation steps.
    const assets =
      steps[index + 1]!.getHolding(generalAdapter1, token).balance -
      steps[index]!.getHolding(generalAdapter1, token).balance;

    if (
      steps
        .slice(index + 2)
        .some(
          (step) => step.getHolding(generalAdapter1, token).balance < assets,
        )
    )
      // If the bundler's balance is at least once lower than assets, the bundler does need these assets.
      return;

    operation.args.receiver = receiver;
  });

  // Simplify Erc20_Transfer(sender = bundler, to = bundler) + MetaMorpho_Withdraw(owner = bundler) = MetaMorpho_Withdraw(owner = from).
  operations.forEach((operation, index) => {
    if (
      operation.type !== "MetaMorpho_Withdraw" ||
      operation.args.owner !== generalAdapter1
    )
      return;

    // shares are not defined when using assets, so we rely on simulation steps.
    const shares =
      steps[index]!.getHolding(generalAdapter1, operation.address).balance -
      steps[index + 1]!.getHolding(generalAdapter1, operation.address).balance;

    const inputTransferIndex = operations.findIndex(
      (candidate) =>
        candidate.type === "Erc20_Transfer" &&
        candidate.address === operation.address &&
        candidate.sender === generalAdapter1 &&
        candidate.args.to === generalAdapter1 &&
        candidate.args.amount >= shares,
    );
    if (inputTransferIndex <= 0) return;

    const inputTransfer = operations[
      inputTransferIndex
    ] as Operations["Erc20_Transfer"];

    inputTransfer.args.amount -= shares;

    operation.args.owner = inputTransfer.args.from;
  });

  // Filter out useless input transfers.
  operations = operations.filter((operation, index) => {
    if (operation.type !== "Erc20_Transfer") return true;

    const { amount, from, to } = operation.args;

    if (from === generalAdapter1 || to !== generalAdapter1) return true;

    const token = operation.address;

    if (
      steps
        .slice(index + 2)
        .some(
          (step) => step.getHolding(generalAdapter1, token).balance < amount,
        )
    )
      // If the bundler's balance is at least once less than amount, the bundler does need these assets.
      // Do not only keep the amount actually used in this case because some input transfers
      // are expected to be larger to account for slippage.
      return true;

    return false;
  });

  // Simulate without slippage to skim the bundler of all possible surplus of shares & assets.
  steps = simulateBundlerOperations(operations, startData, { slippage: 0n });

  // Unwrap requested remaining wrapped tokens.
  const unwraps = [] as Erc20Operations["Erc20_Unwrap"][];

  const endBundlerTokenData = getLast(steps).holdings[generalAdapter1] ?? {};

  unwrapTokens.forEach((wrappedToken) => {
    const remaining = endBundlerTokenData[wrappedToken]?.balance ?? 0n;
    if (remaining <= 5n) return;

    const unwrappedToken = getUnwrappedToken(wrappedToken, startData.chainId);
    if (unwrappedToken == null) return;

    unwraps.push({
      type: "Erc20_Unwrap",
      address: wrappedToken,
      sender: generalAdapter1,
      args: {
        amount: maxUint256,
        receiver,
        slippage: unwrapSlippage,
      },
    });
  });

  if (unwraps.length > 0)
    steps = simulateBundlerOperations(operations.concat(unwraps), startData, {
      slippage: 0n,
    });

  // Skim any token expected to be left on the bundler.
  const skims = [] as Erc20Operations["Erc20_Transfer"][];
  {
    const startBundlerTokenData = steps[0].holdings[generalAdapter1] ?? {};
    const endBundlerTokenData = getLast(steps).holdings[generalAdapter1] ?? {};

    skims.push(
      ...entries(endBundlerTokenData)
        .filter(
          ([token, holding]) =>
            holding != null &&
            holding.balance - (startBundlerTokenData[token]?.balance ?? 0n) >
              5n,
        )
        .map(
          ([address]) =>
            ({
              type: "Erc20_Transfer",
              address,
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: receiver,
              },
            }) as Erc20Operations["Erc20_Transfer"],
        ),
    );
  }

  return operations.concat(unwraps, skims);
};

export const populateBundle = (
  inputOperations: InputBundlerOperation[],
  data: MaybeDraft<SimulationState>,
  options?: BundlingOptions,
) => {
  const steps: SimulationResult = [data];

  let end = data;
  const operations = inputOperations.flatMap((inputOperation, index) => {
    try {
      const subBundleOperations = populateSubBundle(
        inputOperation,
        end,
        options,
      );

      steps.push(
        (end = getLast(simulateBundlerOperations(subBundleOperations, end))),
      );

      return subBundleOperations;
    } catch (error) {
      if (!(error instanceof Error)) throw error;

      throw new BundlerErrors.Bundle(error, index, inputOperation, steps);
    }
  });

  return { operations, steps };
};

export const simulateRequiredTokenAmounts = (
  operations: Operation[],
  data: MaybeDraft<SimulationState>,
) => {
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  const virtualBundlerData = produceImmutable(data, (draft) => {
    Object.values(draft.holdings[generalAdapter1] ?? {}).forEach(
      (bundlerTokenData) => {
        if (bundlerTokenData == null) return;

        // Virtual balance to calculate the amount required.
        bundlerTokenData.balance += MathLib.MAX_UINT_160;
      },
    );
  });

  const steps = simulateOperations(operations, virtualBundlerData);

  const bundlerTokenDiffs = keys(
    virtualBundlerData.holdings[generalAdapter1],
  ).map((token) => ({
    token,
    required: steps
      .map(
        (step) =>
          // When recursively simulated, this will cause tokens to be required at the highest recursion level.
          // For example: supplyCollateral(x, supplyCollateral(y, borrow(z)))   [provided x, y, z < MAX_UINT_160]
          //              |                   |                   |=> MAX_UINT_160 - (3 * MAX_UINT_160 + z) < 0
          //              |                   |=> MAX_UINT_160 - (2 * MAX_UINT_160 - y) < 0
          //              |=> MAX_UINT_160 - (MAX_UINT_160 - y - x) > 0
          MathLib.MAX_UINT_160 -
          (step.holdings[generalAdapter1]?.[token]?.balance ?? 0n),
      )
      .sort(
        bigIntComparator(
          (required) => required,
          // Take the highest required amount among all operations.
          "desc",
        ),
      )[0]!,
  }));

  return bundlerTokenDiffs.filter(({ required }) => required > 0n);
};

export const getSimulatedBundlerOperation = (
  operation: BundlerOperation,
  { slippage }: { slippage?: bigint } = {},
) => {
  const callback = getValue(operation.args, "callback");

  const simulatedOperation = {
    ...operation,
    args: {
      ...operation.args,
      ...(callback && {
        callback: () =>
          callback.map((operation) =>
            getSimulatedBundlerOperation(operation, { slippage }),
          ),
      }),
    },
  } as Operation;

  if (slippage != null) {
    switch (simulatedOperation.type) {
      case "Erc20_Wrap":
      case "Erc20_Unwrap":
      case "Blue_Supply":
      case "Blue_Withdraw":
      case "Blue_Borrow":
      case "Blue_Repay":
      case "MetaMorpho_Deposit":
      case "MetaMorpho_Withdraw":
        simulatedOperation.args.slippage = slippage;
        break;
    }
  }

  return simulatedOperation;
};

export const handleBundlerOperation =
  (options?: { slippage?: bigint }) =>
  (
    operation: BundlerOperation,
    startData: MaybeDraft<SimulationState>,
    index?: number,
  ) =>
    handleOperation(
      getSimulatedBundlerOperation(operation, options),
      startData,
      index,
    );

export const handleBundlerOperations = (
  operations: BundlerOperation[],
  startData: MaybeDraft<SimulationState>,
  options?: { slippage?: bigint },
) => handleOperations(operations, startData, handleBundlerOperation(options));

export const simulateBundlerOperation =
  (options?: { slippage?: bigint }) =>
  (
    operation: BundlerOperation,
    startData: MaybeDraft<SimulationState>,
    index?: number,
  ) =>
    simulateOperation(
      getSimulatedBundlerOperation(operation, options),
      startData,
      index,
    );

export const simulateBundlerOperations = (
  operations: BundlerOperation[],
  startData: MaybeDraft<SimulationState>,
  options?: { slippage?: bigint },
) => handleOperations(operations, startData, simulateBundlerOperation(options));
