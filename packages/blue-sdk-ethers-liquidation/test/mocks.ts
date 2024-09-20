import { TransactionReceipt } from "ethers";
import { ethers } from "hardhat";

import {
  FlashbotsBundleResolution,
  SimulationResponse,
} from "@flashbots/ethers-provider-bundle";

export const getFlashbotsSimulationResponse = (
  simulation: TransactionReceipt[],
): SimulationResponse => {
  const gasPrice = simulation[0]?.gasPrice ?? 0n;
  const totalGasUsed = simulation.reduce(
    (acc, receipt) => acc + receipt.gasUsed,
    0n,
  );

  return {
    bundleHash: "0x",
    coinbaseDiff: 0n,
    ethSentToCoinbase: 0n,
    bundleGasPrice: gasPrice,
    gasFees: gasPrice * totalGasUsed,
    stateBlockNumber: simulation[0]?.blockNumber ?? 0,
    totalGasUsed: totalGasUsed.toFloat(0),
    results: simulation.map((receipt) => ({
      value: "0x00",
      coinbaseDiff: "0x00",
      ethSentToCoinbase: "0x00",
      fromAddress: receipt.from,
      gasFees: (receipt.gasUsed * receipt.gasPrice).toString(),
      gasPrice: receipt.gasPrice.toString(),
      gasUsed: receipt.gasUsed.toFloat(0),
      toAddress: receipt.to!,
      txHash: receipt.hash,
    })),
    // TODO: complete with firstRevert if applicable
  };
};

export const sendRawBundleMockImpl = async (txs: string[]) => {
  const receipts: TransactionReceipt[] = [];

  for (const signedTx of txs) {
    const response = await ethers.provider.broadcastTransaction(signedTx);

    const receipt = await response.wait();
    if (receipt == null) throw Error("receipt is null");

    receipts.push(receipt);
  }

  return {
    _disclaimer: "MOCK RAW BUNDLE RESULT",
    bundleHash: "0x",
    bundleTransactions: [],
    simulate: () => Promise.resolve(getFlashbotsSimulationResponse(receipts)),
    wait: () => Promise.resolve(FlashbotsBundleResolution.BundleIncluded),
    receipts: () => Promise.resolve(receipts),
  };
};
