module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
  overrides: [
    {
      files: ["apps/frontend/src/**/*.{ts,tsx}"],
      env: { browser: true },
      extends: ["plugin:react-hooks/recommended"],
      plugins: ["react-refresh"],
      rules: {
        "react-refresh/only-export-components": [
          "error",
          { allowConstantExport: true },
        ],
      },
    },
    {
      files: ["**/*.test.{ts,tsx}"],
      plugins: ["vitest-globals"],
      env: { "vitest-globals/env": true },
    },
    {
      files: ["**/*.cjs", "commitlint.config.js"],
      rules: { "@typescript-eslint/no-var-requires": "off" },
    },
  ],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/generated/**",
  ],
};
