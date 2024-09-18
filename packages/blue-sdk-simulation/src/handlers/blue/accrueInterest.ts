import { BlueOperations } from "../../operations.js";
import { OperationHandler } from "../types.js";

export const handleBlueAccrueInterestOperation: OperationHandler<
  BlueOperations["Blue_AccrueInterest"]
> = ({ args: { id } }, data) => {
  const marketData = data.getMarket(id);
  const newMarketData = marketData.accrueInterest(data.timestamp);

  data.markets[id] = newMarketData;

  const { feeRecipient } = data.global;
  if (feeRecipient != null) {
    const feeRecipientPosition = data.tryGetPosition(feeRecipient, id);

    if (feeRecipientPosition != null)
      feeRecipientPosition.supplyShares +=
        newMarketData.totalSupplyShares - marketData.totalSupplyShares;
  }
};
