import type { Address } from "viem";

interface PairedEmitter {
  readonly primary: Address;
  readonly paired: Address;
}

/**
 * Verified directional emitter pairs, scoped to the chain carrying their shared ledger.
 * Identity sources, pinned code reads and ledger proofs: test/paired-emitters.md.
 * @internal
 */
export const PAIRED_EMITTERS: Readonly<
  Partial<Record<number, readonly PairedEmitter[]>>
> = {
  1: [
    {
      primary: "0x3231Cb76718CDeF2155FC47b5286d82e6eDA273f",
      paired: "0x39b8B6385416f4cA36a20319F70D28621895279D",
    },
  ],
  999: [
    {
      primary: "0x94e8396e0869c9F2200760aF0621aFd240E1CF38",
      paired: "0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1",
    },
  ],
  5042: [
    {
      primary: "0x3600000000000000000000000000000000000000",
      paired: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
    },
  ],
};
