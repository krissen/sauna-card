import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "tmp/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      // TypeScript already resolves identifiers (DOM globals, __VERSION__ via
      // the ambient declaration in src/global.d.ts), so core no-undef would only
      // produce false positives. typescript-eslint's recommended config already
      // turns it off; we set it explicitly so the intent is clear regardless of
      // config ordering.
      "no-undef": "off",
    },
  },
);
