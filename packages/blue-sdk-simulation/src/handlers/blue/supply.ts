import { MaxUint256 } from "ethers";

import { BlueErrors, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { BlueOperations } from "../../operations";
import { handleOperations } from "../dispatchers";
import { handleErc20Operation } from "../erc20";
import { OperationHandler } from "../types";

import { handleBlueAccrueInterestOperation } from "./accrueInterest";

export const handleBlueSupplyOperation: OperationHandler<
  BlueOperations["Blue_Supply"]
> = (
  {
    args: { id, assets = 0n, shares = 0n, onBehalf, callback, slippage = 0n },
    sender,
    address,
  },
  data,
) => {
  handleBlueAccrueInterestOperation(
    {
      type: "Blue_AccrueInterest",
      sender: address,
      address,
      args: { id },
    },
    data,
  );

  const market = data.getMarket(id);
  const { bundler } = getChainAddresses(data.chainId);

  // Simulate the bundler's behavior on supply.
  if (sender === bundler && assets === MaxUint256)
    assets = MathLib.min(
      assets,
      data.getHolding(bundler, market.config.loanToken).balance,
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
      sender: address,
      address: market.config.loanToken,
      args: {
        amount: assets,
        from: sender,
        to: address,
      },
    },
    data,
  );
};
