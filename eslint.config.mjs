import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      'brand/**',
      'apps/desktop/src-tauri/gen/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Unused code is either a mistake or a leftover. Both are worth an error,
      // but an underscore prefix is a deliberate "yes, I know".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // scene-ops is the contract every other layer trusts. `any` there is how
      // a broken scene reaches a user without a single compiler complaint.
      '@typescript-eslint/no-explicit-any': 'error',

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  {
    // Config files run in Node and legitimately need its globals and console.
    files: ['**/*.config.{ts,js,mjs,cjs}', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
)
