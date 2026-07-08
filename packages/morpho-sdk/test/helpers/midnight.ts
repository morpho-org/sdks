import { ChainId } from "@morpho-org/blue-sdk";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import type { Address } from "viem";

export const midnightForkAddresses = {
  midnight: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A" as Address,
  midnightBundles: "0x091183d729BE9f808c212b475E387A12E67850A7" as Address,
  midnightMempool: "0xdD6DCE32e21f7b020898a8258dA37355b4017993" as Address,
  ecrecoverRatifier: "0xd6e70365C8E8DDa9a4ca662C07bbE663b017755E" as Address,
  setterRatifier: "0x800B5F12A61B8198a5a6EfD794Cac6699B294d63" as Address,
  oracle: "0x0000000000000000000000000000000000080000" as Address,
};

registerCustomAddresses({
  addresses: {
    [ChainId.BaseMainnet]: {
      midnight: midnightForkAddresses.midnight,
      midnightBundles: midnightForkAddresses.midnightBundles,
      midnightMempool: midnightForkAddresses.midnightMempool,
      ecrecoverRatifier: midnightForkAddresses.ecrecoverRatifier,
      setterRatifier: midnightForkAddresses.setterRatifier,
    },
  },
});
