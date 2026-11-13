/**
 * The engine's own version. Stored on every design revision beside the
 * document format and the company's ruleset version, so any stored cut list
 * can be traced to the code that produced it.
 *
 * Kept equal to the version in package.json; a test fails if they drift.
 */
export const ENGINE_VERSION = '0.2.0';
