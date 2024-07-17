import { Block } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import sinon from "sinon";

import {
  SnapshotRestorer,
  mine as hardhatMine,
  reset as hardhatReset,
  takeSnapshot,
} from "@nomicfoundation/hardhat-network-helpers";

try {
  import("@nomicfoundation/hardhat-ethers");

  const { ethers } = require("hardhat") as HardhatRuntimeEnvironment;

  Object.defineProperty(ethers.provider, "_networkName", {
    value: "mainnet",
  });
} catch {}

export const mine = async (
  blocks = 1,
  options: { interval?: number } = {},
  emit = true,
) => {
  const { ethers } = require("hardhat") as HardhatRuntimeEnvironment;

  await hardhatMine(blocks, options);

  if (emit)
    await ethers.provider.emit("block", await ethers.provider.getBlockNumber());
};

export const reset = ({
  url,
  blockNumber,
}: {
  url?: string | null;
  blockNumber?: number;
} = {}) => {
  if (url === null) return hardhatReset();

  const { config } = require("hardhat") as HardhatRuntimeEnvironment;

  url ??= config.networks.hardhat.forking?.url;
  blockNumber ??= config.networks.hardhat.forking?.blockNumber;

  return hardhatReset(url, blockNumber);
};

export const resetAfterEach = (forking?: {
  url?: string | null;
  blockNumber?: number;
}) => {
  afterEach(async () => {
    await reset(forking);
  });
};

export const setUp = (onBefore?: (block: Block) => void) => {
  const { network } = require("hardhat") as HardhatRuntimeEnvironment;

  let snapshot: SnapshotRestorer;

  before(async () => {
    const blockNumber = await network.provider.send("eth_blockNumber");
    const block = await network.provider.send("eth_getBlockByNumber", [
      blockNumber,
      false,
    ]);

    await onBefore?.(block!);

    snapshot = await takeSnapshot();
  });

  const dataObserver = { next: sinon.spy(), error: sinon.spy() };

  afterEach(async () => {
    await snapshot.restore();

    dataObserver.next.resetHistory();
    dataObserver.error.resetHistory();
  });

  after(async () => {
    await reset();
  });

  return dataObserver;
};
