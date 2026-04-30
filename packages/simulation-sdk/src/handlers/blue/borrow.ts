import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueSimulationErrors, SimulationErrors } from "../../errors.js";
import type { BlueOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { handleBlueAccrueInterestOperation } from "./accrueInterest.js";

export const handleBlueBorrowOperation: OperationHandler<
  BlueOperations["Blue_Borrow"]
> = (
  {
    args: { id, assets = 0n, shares = 0n, onBehalf, receiver, slippage = 0n },
    sender,
  },
  data,
) => {
  const {
    morpho,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  if (sender === generalAdapter1) {
    const userData = data.getUser(onBehalf);

    if (!userData.isBundlerAuthorized)
      throw new BlueSimulationErrors.UnauthorizedBundler(onBehalf);
  }

  if ((assets === 0n) === (shares === 0n))
    throw new BlueErrors.InconsistentInput(assets, shares);

  if (slippage >= MathLib.WAD)
    throw new SimulationErrors.InvalidInput({ slippage });

  handleBlueAccrueInterestOperation(
    {
      type: "Blue_AccrueInterest",
      sender: morpho,
      args: { id },
    },
    data,
  );

  const market = data.getMarket(id);
  if (market.price == null) throw new BlueErrors.UnknownOraclePrice(id);

  // Mirrors the `minSharePrice = (WAD - slippage)` floor encoded by
  // `GeneralAdapter1.morphoBorrow`: the simulator must book the worst-case
  // borrow that the onchain slippage guard still permits, i.e. up to
  // `expectedShares / (WAD - slippage)` shares in asset-mode and down to
  // `expectedAssets * (WAD - slippage)` assets in share-mode.
  if (shares === 0n)
    shares = MathLib.wDivUp(
      market.toBorrowShares(assets, "Up"),
      MathLib.WAD - slippage,
    );
  else
    assets = market.toBorrowAssets(
      MathLib.wMulDown(shares, MathLib.WAD - slippage),
      "Down",
    );

  market.totalBorrowAssets += assets;
  market.totalBorrowShares += shares;

  if (market.totalBorrowAssets > market.totalSupplyAssets)
    throw new BlueErrors.InsufficientLiquidity(id);

  const position = data.getPosition(onBehalf, id);

  position.borrowShares += shares;

  if (!market.isHealthy(position))
    throw new BlueErrors.InsufficientCollateral(onBehalf, id);

  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: market.params.loanToken,
      args: {
        amount: assets,
        from: morpho,
        to: receiver,
      },
    },
    data,
  );
};
