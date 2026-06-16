-- Better Auth core schema for SQLite / Cloudflare D1
-- Generated manually from better-auth@1.6.19 source (get-tables.ts + get-migration.ts)
-- because the @better-auth/cli generate command cannot introspect a D1 placeholder DB.
-- Tables: user (order 1), session (order 2), account (order 3), verification (order 4)

CREATE TABLE `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL UNIQUE,
  `emailVerified` integer NOT NULL,
  `image` text,
  `createdAt` date NOT NULL,
  `updatedAt` date NOT NULL
);

CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expiresAt` date NOT NULL,
  `token` text NOT NULL UNIQUE,
  `createdAt` date NOT NULL,
  `updatedAt` date NOT NULL,
  `ipAddress` text,
  `userAgent` text,
  `userId` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE `account` (
  `id` text PRIMARY KEY NOT NULL,
  `accountId` text NOT NULL,
  `providerId` text NOT NULL,
  `userId` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `accessToken` text,
  `refreshToken` text,
  `idToken` text,
  `accessTokenExpiresAt` date,
  `refreshTokenExpiresAt` date,
  `scope` text,
  `password` text,
  `createdAt` date NOT NULL,
  `updatedAt` date NOT NULL
);

CREATE TABLE `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expiresAt` date NOT NULL,
  `createdAt` date NOT NULL,
  `updatedAt` date NOT NULL
);

CREATE INDEX `session_userId_idx` ON `session`(`userId`);

CREATE INDEX `account_userId_idx` ON `account`(`userId`);

CREATE INDEX `verification_identifier_idx` ON `verification`(`identifier`);
