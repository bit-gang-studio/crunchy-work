import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.crunchy/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Everything that runs in Node: the binary, the server, the DB layer, configs.
    files: ['bin/**/*.js', 'src/server/**', 'src/db/**', '*.config.ts', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/web/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
