import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Account, Address, Chain, Client, Transport } from "viem";
import type { EcrecoverSignatureInput } from "./EcrecoverRatifier.js";
import type { TreeSnapshot } from "./treeTypes.js";

/** Tagged Ecrecover tree and chain used to construct signing data or a digest. */
export interface EcrecoverRatifierTypedDataRequest {
  /** Complete Ecrecover leaf commitments, from a tree instance or portable snapshot. */
  readonly tree: TreeSnapshot<"ecrecover">;
  /** Chain defining the signing domain. */
  readonly chainId: BigIntish;
}

/** Tagged Ecrecover tree and signer used to request a signature. */
export interface EcrecoverRatifierSignRequest {
  /** Complete Ecrecover leaf commitments. */
  readonly tree: TreeSnapshot<"ecrecover">;
  /** Client used at the signing boundary. */
  readonly client: Client<Transport, Chain, Account | undefined>;
  /** Maker or authorized signer. */
  readonly account: Account | Address;
}

/** Tagged Ecrecover tree with either a signing client or a precomputed signature. */
export type EcrecoverRatifierRatifyRequest =
  | (EcrecoverRatifierSignRequest & {
      /** Omit when requesting a signature through the client. */
      readonly signature?: undefined;
    })
  | {
      /** Complete Ecrecover leaf commitments. */
      readonly tree: TreeSnapshot<"ecrecover">;
      /** Maker or authorized signer that produced the signature. */
      readonly account: Account | Address;
      /** Signature over this tree's signing digest. */
      readonly signature: EcrecoverSignatureInput;
      /** Omit when supplying a precomputed signature. */
      readonly client?: undefined;
      /** The chain is derived from the offers when supplying a signature. */
      readonly chainId?: undefined;
    };

/** Tagged Ecrecover tree, signature and leaf index used to encode one proof. */
export interface EcrecoverRatifierDataRequest {
  /** Complete Ecrecover leaf commitments. */
  readonly tree: TreeSnapshot<"ecrecover">;
  /** Leaf to prove. */
  readonly leafIndex: BigIntish;
  /** Signature over the tree's signing digest. */
  readonly signature: EcrecoverSignatureInput;
}

/** Tagged Setter tree whose root has been approved onchain. */
export interface SetterRatifierRatifyRequest {
  /** Complete Setter leaf commitments; the tag does not prove onchain approval. */
  readonly tree: TreeSnapshot<"setter">;
}

/** Tagged Setter tree and leaf index used to encode one proof. */
export interface SetterRatifierDataRequest extends SetterRatifierRatifyRequest {
  /** Leaf to prove. */
  readonly leafIndex: BigIntish;
}
