import { User as BlueUser } from "@morpho-org/blue-sdk";
import { fetchUser } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace User {
    let fetch: typeof fetchUser;
  }
}

BlueUser.fetch = fetchUser;

export { BlueUser as User };
