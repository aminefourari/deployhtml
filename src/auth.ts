import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import { Env } from "./env";

export const authOptions = {
  emailAndPassword: { enabled: true },
};

export function createAuth(request: Request, env: Env) {
  const origin = new URL(request.url).origin;
  return betterAuth({
    ...authOptions,
    database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" as const },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [origin],
  });
}

export type Auth = ReturnType<typeof createAuth>;
