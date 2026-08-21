//**
// vitest.config.ts
// Unit test config: node environment, @/ path alias matching tsconfig
//**
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
