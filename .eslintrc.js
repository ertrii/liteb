/**
 * ESLint decides what the code MEANS. Prettier decides what it LOOKS LIKE.
 *
 * `plugin:prettier/recommended` is what keeps those two from arguing: it turns
 * off every stylistic ESLint rule that could disagree with the formatter, and
 * reports whatever Prettier would change as a single `prettier/prettier` error
 * — so `eslint --fix` formats and lints in one pass.
 *
 * The rule takes NO options on purpose. Prettier's settings live in
 * `.prettierrc` and nowhere else; options here would win over that file and
 * leave two places to change one thing, which is how `singleQuote` ends up
 * true in the editor and false in CI. `.editorconfig` carries the same values
 * for editors that do not run Prettier at all.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
    jest: true,
  },
  // Everything here is either generated, built, or not TypeScript this
  // tsconfig knows about — and `parserOptions.project` fails loudly on a file
  // the program does not include.
  ignorePatterns: [
    '.eslintrc.js',
    'dist',
    'types',
    'build',
    'coverage',
    'logs',
    'node_modules',
    'test/.generated',
    // Anchored: a bare `scripts` also swallows `src/scripts`, which IS ours.
    '/scripts',
    '*.js',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // The framework hands back what an endpoint returned and takes whatever an
    // author logs. `unknown` at those seams would only be cast away.
    '@typescript-eslint/no-explicit-any': 'off',
    // Declaration merging is how an application fills in `LitebAuth`.
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    // `Function` stays allowed, and only `Function`. A module's entities and
    // migrations ARE classes, and that is how TypeORM types them
    // (`entities: (Function | string | EntitySchema)[]`) — narrowing it here
    // would mean casting at every seam where liteb hands a list back to
    // TypeORM. Everything else the rule bans (`{}`, `Object`, `String`) is
    // still banned, which is where it earns its keep.
    '@typescript-eslint/ban-types': [
      'error',
      { types: { Function: false }, extendDefaults: true },
    ],
  },
};
