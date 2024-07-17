import { User } from "@morpho-org/blue-sdk";
import { fetchUser } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace User {
    let fetch: typeof fetchUser;
  }
}

User.fetch = fetchUser;
