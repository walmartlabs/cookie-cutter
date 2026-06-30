// @ts-check
const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettierPlugin = require("eslint-plugin-prettier");
const prettierConfig = require("eslint-config-prettier");
const globals = require("globals");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
    {
        ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
    },
    js.configs.recommended,
    prettierConfig,
    {
        plugins: {
            "@typescript-eslint": tsPlugin,
            prettier: prettierPlugin,
        },
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                project: true,
                EXPERIMENTAL_useProjectService: true,
            },
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,

            // Formatting — downgraded to warn; auto-fixable, was never enforced under tslint
            "prettier/prettier": "warn",

            // Console — downgraded to warn; code has intentional console usages pre-migration
            "no-console": "warn",

            // Floating promises — downgraded to warn; existing violations pre-date eslint migration
            "@typescript-eslint/no-floating-promises": "warn",

            // TypeScript-aware replacements for base JS rules
            // Base no-redeclare fires on TS declaration merging; the TS version is aware of it
            "no-redeclare": "off",
            // TypeScript handles undefined references at compile time; no-undef causes
            // false positives for TS globals like NodeJS, NodeJS.Timeout, etc.
            "no-undef": "off",
            // Base no-unused-vars doesn't understand TS type-only usage; use TS version
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],

            // Naming convention: allow PascalCase on variables (class constructor references,
            // renamed imports like `import { Foo as Bar }`)
            "@typescript-eslint/naming-convention": [
                "error",
                {
                    selector: "variable",
                    format: ["camelCase", "UPPER_CASE", "PascalCase", "snake_case"],
                    leadingUnderscore: "allow",
                },
            ],

            // Rules that are new in @typescript-eslint v8 / ESLint v10 and were not
            // present in the previous v5/v6 recommended set — turn off until the team
            // decides to adopt them
            "@typescript-eslint/no-unsafe-function-type": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-wrapper-object-types": "off",
            "@typescript-eslint/no-array-constructor": "off",
            "@typescript-eslint/no-this-alias": "off",
            "@typescript-eslint/ban-ts-comment": "warn",
            "no-useless-assignment": "off",
            // js.configs.recommended rules that fire on pre-existing code (tslint migration)
            "no-useless-catch": "off",
            "no-useless-escape": "off",
            "no-constant-condition": "off",
            "no-constant-binary-expression": "off",
            "no-async-promise-executor": "off",
            "preserve-caught-error": "off",

            // Kept as explicit errors (intentional rules)
            "arrow-body-style": "off",
            "prefer-arrow-callback": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-shadow": "off",
            "@typescript-eslint/no-unused-expressions": "off",
            "max-len": "off",
            "max-classes-per-file": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/member-ordering": "off",
            "@typescript-eslint/no-explicit-any": "warn",
        },
    },
    {
        // Jest globals for test files; also disable project-based type checking
        // since some packages exclude __test__ directories from their tsconfig
        files: ["**/__test__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
        languageOptions: {
            parserOptions: {
                project: false,
                EXPERIMENTAL_useProjectService: false,
            },
            globals: {
                ...globals.jest,
            },
        },
        rules: {
            "@typescript-eslint/no-floating-promises": "off",
        },
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            parserOptions: {
                project: false,
                EXPERIMENTAL_useProjectService: false,
            },
        },
        rules: {
            "@typescript-eslint/no-var-requires": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "no-irregular-whitespace": "off",
        },
    },
];
