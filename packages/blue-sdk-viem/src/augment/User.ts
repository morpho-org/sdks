import { User } from "@gfxlabs/blue-sdk";
import { fetchUser } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace User {
    let fetch: typeof fetchUser;
  }
}

User.fetch = fetchUser;

export { User };
