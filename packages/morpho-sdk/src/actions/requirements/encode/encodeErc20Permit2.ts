import { type Address, MathLib, getChainAddresses } from "@morpho-org/blue-sdk";
import { getPermit2PermitTypedData } from "@morpho-org/blue-sdk-viem";
import { Time, deepFreeze } from "@morpho-org/morpho-ts";
import { type Client, verifyTypedData } from "viem";
import { signTypedData } from "viem/actions";
import {
  AddressMismatchError,
  InvalidSignatureError,
  MissingClientPropertyError,
  type Permit2Action,
  type Requirement,
} from "../../../types/index.js";

interface EncodeErc20Permit2Params {
  token: Address;
  amount: bigint;
  chainId: number;
  nonce: bigint;
  expiration: bigint;
}

export const encodeErc20Permit2 = (
  params: EncodeErc20Permit2Params,
): Requirement => {
  const {
    token,
    amount,
    chainId,
    nonce,
    expiration = MathLib.MAX_UINT_48,
  } = params;

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const action: Permit2Action = {
    type: "permit2",
    args: {
      spender: generalAdapter1,
      amount,
      deadline,
      expiration,
    },
  };

  return {
    action,
    async sign(client: Client, userAddress: Address) {
      if (!client.account?.address) {
        throw new MissingClientPropertyError("client.account.address");
      }
      if (client.account.address !== userAddress) {
        throw new AddressMismatchError(client.account.address, userAddress);
      }

      const typedData = getPermit2PermitTypedData(
        {
          // Never permit any other address than the GeneralAdapter1 otherwise
          // the signature can be used independently.
          spender: generalAdapter1,
          allowance: amount,
          erc20: token,
          nonce: Number(nonce),
          deadline,
          expiration: Number(expiration),
        },
        chainId,
      );
      const signature = await signTypedData(client, {
        ...typedData,
        account: client.account,
      });

      const isValid = await verifyTypedData({
        ...typedData,
        address: userAddress,
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

      return deepFreeze({
        args: {
          owner: userAddress,
          signature,
          deadline,
          amount,
          asset: token,
          expiration,
          nonce,
        },
        action,
      });
    },
  };
};
