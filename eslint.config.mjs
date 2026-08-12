import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// `import.meta.dirname` n'existe qu'à partir de Node 20.11.
const here = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: here },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    // Fichiers de configuration : pas de type-checking, juste les globales Node.
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', process: 'readonly' },
    },
  },
  prettier,
);
