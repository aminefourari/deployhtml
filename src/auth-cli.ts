import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { authOptions } from "./auth";

// CLI-only: used by `npx @better-auth/cli generate` to produce the migration.
// NOT imported by the Worker at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = betterAuth({
  ...authOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: { dialect: new D1Dialect({ database: {} as any }), type: "sqlite" as const },
});
