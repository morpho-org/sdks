import { User } from "@morpho-org/blue-sdk";
import { fetchUser } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace User {
    let fetch: typeof fetchUser;
  }
}

User.fetch = fetchUser;

export { User };
