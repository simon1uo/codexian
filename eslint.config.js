import { dirname } from "path";
import { fileURLToPath } from "url";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const obsidianRecommendedConfigs = Array.from(
	(obsidianmd.configs?.recommended ?? [])
);

export default defineConfig([
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				tsconfigRootDir: __dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianRecommendedConfigs,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: "./tsconfig.eslint.json",
			},
		},
	},
	{
		files: ["tests/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.jest,
			},
		},
	},
	{
		files: ["src/**/*.ts", "src/**/*.tsx"],
		rules: {
			"no-undef": "off",
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
]);
