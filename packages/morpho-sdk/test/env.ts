import { z } from "zod";

const envSchema = z.object({
  // RPC URLs for different chains
  MAINNET_RPC_URL: z.string("must be a string").min(1, "cannot be empty"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars: string[] = [];
      const invalidVars: string[] = [];

      for (const err of error.issues) {
        const varName = err.path.join(".");
        invalidVars.push(
          `${varName}: ${err.message || `${varName} is invalid`}`,
        );
      }

      let errorMessage = "\nEnvironment variable validation error\n\n";

      if (missingVars.length > 0) {
        errorMessage += "Missing required environment variables:\n";
        missingVars.forEach((varError) => {
          errorMessage += `- ${varError}\n`;
        });
        errorMessage += "\n";
      }

      if (invalidVars.length > 0) {
        errorMessage += "Invalid environment variables:\n";
        invalidVars.forEach((varError) => {
          errorMessage += `- ${varError}\n`;
        });
        errorMessage += "\n";
      }

      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    throw error;
  }
}

let validatedEnv: Env | null = null;

/**
 * Function to get validated environment variables
 * Validation is performed only once on the first call
 *
 * @returns Validated and typed environment variables
 */
export function env(): Env {
  if (!validatedEnv) {
    validatedEnv = validateEnv();
  }
  return validatedEnv;
}
