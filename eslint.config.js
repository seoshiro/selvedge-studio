import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".npm-cache/**",
      ".private/**",
      "test-results/**",
      "playwright-report/**",
      "docs/gallery/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        fetch: "readonly",
        URL: "readonly",
        document: "readonly",
        scrollTo: "readonly",
        innerWidth: "readonly",
      },
    },
  },
);
