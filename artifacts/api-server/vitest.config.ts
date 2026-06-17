import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      // Avoid the pino-pretty worker transport during tests so the process
      // exits cleanly; production config logs plainly to stdout.
      NODE_ENV: "production",
      LOG_LEVEL: "silent",
      // Tests use plain HTTP, so secure cookies would never be resent.
      SESSION_COOKIE_SECURE: "false",
    },
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
