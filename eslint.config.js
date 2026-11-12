import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      // Agents' git worktrees: copies of the repository, each linted where it is.
      '.claude/**',
      '**/.wrangler/**',
      '**/worker-configuration.d.ts',
      '**/test/goldens/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Adding members to a generated interface is done by extending it.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },

  // The engine is pure: no screen, no network, no clock, no storage, no
  // chance. The same design and rules must give the same answer everywhere.
  {
    files: ['packages/engine/src/**'],
    rules: {
      'no-console': 'error',
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch', 'process', 'crypto'].map(
          (name) => ({ name, message: 'The engine is pure. It cannot use the platform it happens to run on.' })
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The engine cannot depend on chance.' },
        { object: 'Date', property: 'now', message: 'The engine cannot read the clock.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'The engine cannot read the clock.' },
      ],
    },
  },

  // Company data is reached through the data layer and nowhere else.
  {
    files: ['apps/api/src/**'],
    ignores: ['apps/api/src/db/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='DB']",
          message: 'Only src/db touches the database. Use companyDb(env, companyId).',
        },
      ],
    },
  },

  // The browser apps.
  {
    files: [
      'apps/designer/src/**',
      'apps/designer/public/**',
      'apps/workspace/src/**',
      'packages/ui/src/**',
      // The one script SetOut's own site runs in a browser.
      'apps/site/src/client/**',
    ],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // The designer's screens moved across from the Custom Showers configurator
  // and predate the React Compiler rules. They work, and the measuring step
  // is being replaced by the card deck, so these three rules are held back
  // for those screens until each is rebuilt. New screens do not get the pass.
  {
    files: ['apps/designer/src/designer/**'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
    },
  },

  // Config files and the moved engine tests run in Node.
  {
    files: ['**/*.config.{js,ts}', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  }
);
