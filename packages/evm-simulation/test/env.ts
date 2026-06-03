import { z } from "zod";

const envSchema = z.object({
  MAINNET_RPC_URL: z.string("must be a string").min(1, "cannot be empty"),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

/**
 * Validate and return the environment variables required by the fork tests.
 * Validation runs once and is cached for subsequent calls.
 *
 * @returns The validated, typed environment.
 * @throws {z.ZodError} when `MAINNET_RPC_URL` is missing or empty.
 */
export function env(): Env {
  if (!validatedEnv) validatedEnv = envSchema.parse(process.env);
  return validatedEnv;
}
