/**
 * Shared typedefs for the structured macro environment object (MacroEnv)
 * used by the macro engine, registry, env builder, and macro definition
 * modules. This file intentionally only contains JSDoc typedefs so that
 * it can be imported purely for type information from multiple modules
 * without creating runtime dependencies.
 */

/**
 * @typedef {Object} MacroEnvNames
 * @property {string} [user]
 * @property {string} [char]
 * @property {string} [group]
 * @property {string} [groupNotMuted]
 * @property {string} [notChar]
 */

/**
 * @typedef {Object} MacroEnvCharacter
 * @property {string} [description]
 * @property {string} [personality]
 * @property {string} [scenario]
 * @property {string} [persona]
 * @property {string} [charPrompt]
 * @property {string} [charInstruction]
 * @property {string} [mesExamplesRaw]
 * @property {string} [charDepthPrompt]
 * @property {string} [creatorNotes]
 * @property {string} [version]
 */

/**
 * @typedef {Object} MacroEnvSystem
 * @property {string} [model]
 */

/**
 * @typedef {Object} MacroEnv
 * @property {MacroEnvNames} [names]
 * @property {MacroEnvCharacter} [character]
 * @property {MacroEnvSystem} [system]
 * @property {Record<string, unknown>} [extra]
 */

export {};
