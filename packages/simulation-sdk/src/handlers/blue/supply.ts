import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import type { BlueOperations } from "../../operations.js";
import { handleOperations } from "../dispatchers.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { handleBlueAccrueInterestOperation } from "./accrueInterest.js";

export const handleBlueSupplyOperation: OperationHandler<
  BlueOperations["Blue_Supply"]
> = (
  {
    args: { id, assets = 0n, shares = 0n, onBehalf, callback, slippage = 0n },
    sender,
  },
  data,
) => {
  const { morpho, bundler } = getChainAddresses(data.chainId);

  handleBlueAccrueInterestOperation(
    {
      type: "Blue_AccrueInterest",
      sender: morpho,
      args: { id },
    },
    data,
  );

  const market = data.getMarket(id);

  // Simulate the bundler's behavior on supply.
  if (sender === bundler && assets === MathLib.MAX_UINT_256)
    assets = MathLib.min(
      assets,
      data.getHolding(bundler, market.params.loanToken).balance,
    );

  if (assets === 0n && shares === 0n) throw new BlueErrors.InconsistentInput();

  if (shares === 0n) {
    shares = market.toSupplyShares(
      MathLib.wDivDown(assets, MathLib.WAD + slippage),
      "Down",
    );
  } else
    assets = MathLib.wMulUp(
      market.toSupplyAssets(shares, "Up"),
      MathLib.WAD + slippage,
    );

  market.totalSupplyAssets += assets;
  market.totalSupplyShares += shares;

  const position = data.getPosition(onBehalf, id);

  position.supplyShares += shares;

  if (callback) handleOperations(callback(data), data);

  // Transfer loan.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: morpho,
      address: market.params.loanToken,
      args: {
        amount: assets,
        from: sender,
        to: morpho,
      },
    },
    data,
  );
};
