import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "threads",
    maxWorkers: 2,
    exclude: [...configDefaults.exclude, "dist/**", "test/**"],
  },
});
