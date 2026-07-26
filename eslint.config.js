import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'pnpm-lock.yaml'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Determinism (ADR-0004): engine packages may not read wall clocks or
    // ambient randomness. All randomness flows through @motionforge/core rng.
    files: ['packages/{core,lang,motion,render,maps,voice}/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use seeded RngStreams from @motionforge/core (ADR-0004).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Engine code must not read the wall clock (ADR-0004).',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'Engine code must not read the wall clock (ADR-0004).',
        },
        {
          object: 'process',
          property: 'hrtime',
          message: 'Engine code must not read the wall clock (ADR-0004).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Engine code must not read the wall clock (ADR-0004).',
        },
      ],
    },
  },
  prettier,
);
