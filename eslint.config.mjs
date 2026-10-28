import eslint from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', 'var/**', 'public/**', '**/*.ts', '**/*.tsx'] },
  eslint.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
];
