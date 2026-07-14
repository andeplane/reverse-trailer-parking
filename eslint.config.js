// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: { unicorn },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        {
          selector: "variableLike",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        { selector: "variable", modifiers: ["const"], format: ["camelCase", "UPPER_CASE"] },
        { selector: "property", format: null },
        { selector: "import", format: null },
      ],
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },
  {
    files: ["*.config.ts", "*.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
