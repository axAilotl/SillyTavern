/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */
/** @typedef {import('./MacroCstWalker.js').MacroCall} MacroCall */

import { isFalseBoolean, isTrueBoolean } from '../../utils.js';
import { MacroEngine } from './MacroEngine.js';
import { createMacroRuntimeError, logMacroRegisterError, logMacroRegisterWarning, logMacroRuntimeWarning } from './MacroDiagnostics.js';

/**
 * Enum of standard macro categories for grouping in documentation and autocomplete.
 * Extensions may use these or define custom category strings.
 *
 * @readonly
 * @enum {string}
 */
export const MacroCategory = Object.freeze({
    /** Basic utilities and text manipulation (newline, noop, trim, reverse, comment) */
    UTILITY: 'utility',
    /** Randomization and dice rolling (random, pick, roll) */
    RANDOM: 'random',
    /** Participant names and name lists (user, char, group, notChar) */
    NAMES: 'names',
    /** Character card fields and persona (description, personality, scenario, mesExamples, persona) */
    CHARACTER: 'character',
    /** Chat history, messages, and swipes */
    CHAT: 'chat',
    /** Date, time, and duration macros */
    TIME: 'time',
    /** Local and global variable operations */
    VARIABLE: 'variable',
    /** Prompt templates for text completion (instruct sequences, system prompts, author's notes, context templates) */
    PROMPTS: 'prompts',
    /** Runtime application state (model, API, lastGenerationType, isMobile) */
    STATE: 'state',
    /** Macros that don't fit in any of the other categories, but don't really need/deserve their own */
    MISC: 'misc',
});

/**
 * @typedef {Object} MacroDefinitionOptions
 * @property {MacroCategory|string} category - Category for grouping in documentation/autocomplete. Use MacroCategory enum values or a custom string.
 * @property {number|MacroPositionalArgDef[]} [requiredArgs=0] - Specifies the macro requires this many unnamed positional arguments or provides detailed definitions for them. (defaults to 0)
 * @property {boolean|MacroListSpec} [list] - Whether the macro allows a list of arguments (optional min and max values can be set). These arguments will be added AFTER the required args.
 * @property {boolean} [strictArgs=true] - Whether the macro should be strict about its arguments.
 * @property {string} [description=''] - Add a description of what the macro does.
 * @property {string} [returns] - Add a specific description of what the macro returns, if it is not obvious from the description.
 * @property {string} [displayOverride] - Override the auto-generated macro signature for display (must include curly braces, e.g. "{{macro::arg}}").
 * @property {string|string[]} [exampleUsage] - Example usage(s) shown in documentation (must include curly braces).
 * @property {MacroHandler} handler - The handler function for the macro.
 */

/**
 * @typedef {Object} MacroPositionalArgDef
 * @property {string} name
 * @property {string} [sampleValue]
 * @property {string} [description]
 * @property {MacroArgType} [type='string']
 */

/**
 * @typedef {'string'|'integer'|'number'|'boolean'} MacroArgType
 */

/**
 * @typedef {Object} MacroListSpec
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * @typedef {(context: MacroExecutionContext) => string} MacroHandler
 */

/**
 * @typedef {Object} MacroExecutionContext
 * @property {string} name
 * @property {string[]} args
 * @property {string[]} requiredArgs
 * @property {string[]|null} list
 * @property {{ [key: string]: string }|null} namedArgs
 * @property {string} raw
 * @property {MacroEnv} env
 * @property {CstNode|null} cstNode
 * @property {{ startOffset: number, endOffset: number }|null} range
 * @property {(value: any) => string} normalize - Normalize function to use on unsure macro results to make sure they return strings as expected.
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name
 * @property {MacroCategory|string} category
 * @property {number} requiredArgs
 * @property {MacroPositionalArgDef[]} requiredArgDefs
 * @property {{ min: number, max: (number|null) }|null} list
 * @property {boolean} strictArgs
 * @property {string} description
 * @property {string|null} returns
 * @property {string|null} displayOverride - Override for the auto-generated macro signature display.
 * @property {string[]} exampleUsage - Example usage strings for documentation.
 * @property {MacroHandler} handler
 * @property {MacroSource} source
 */

/**
 * @typedef {Object} MacroSource
 * @property {string} name - Source identifier (extension name or script path)
 * @property {boolean} isExtension - True if registered from an extension
 * @property {boolean} isThirdParty - True if registered from a third-party extension
 */

/**
 * The singleton instance of the MacroRegistry.
 *
 * @type {MacroRegistry}
 */
let instance;
export { instance as MacroRegistry };

class MacroRegistry {
    /** @type {MacroRegistry} */ static #instance;
    /** @type {MacroRegistry} */ static get instance() { return MacroRegistry.#instance ?? (MacroRegistry.#instance = new MacroRegistry()); }

    /** @type {Map<string, MacroDefinition>} */
    #macros;

    /**
     * @private
     */
    constructor() {
        /** @type {Map<string, MacroDefinition>} */
        this.#macros = new Map();
    }

    /**
     * Registers a macro with the registry.
     * Errors during registration are caught and logged, the macro will not be registered, and the function returns null.
     *
     * @param {string} name - Macro name (identifier).
     * @param {MacroDefinitionOptions} options - Macro registration options including handler and metadata.
     * @returns {MacroDefinition|null} The registered definition, or null if registration failed.
     */
    registerMacro(name, options) {
        // Extract name early for error logging
        const macroName = typeof name === 'string' ? name.trim() : String(name);

        try {
            if (typeof name !== 'string' || !name.trim()) throw new Error('Macro name must be a non-empty string');
            name = name.trim();
            if (!options || typeof options !== 'object') throw new Error(`Macro "${name}" options must be a non-null object.`);

            const {
                category: rawCategory,
                requiredArgs: rawRequiredArgs,
                list: rawList,
                strictArgs: rawStrictArgs,
                description: rawDescription,
                returns: rawReturns,
                displayOverride: rawDisplayOverride,
                exampleUsage: rawExampleUsage,
                handler,
            } = options;

            if (typeof handler !== 'function') throw new Error(`Macro "${name}" options.handler must be a function.`);
            if (typeof rawCategory !== 'string' || !rawCategory.trim()) throw new Error(`Macro "${name}" options.category must be a non-empty string.`);
            const category = rawCategory.trim();

            let requiredArgs = 0;
            /** @type {MacroPositionalArgDef[]} */
            let requiredArgDefs = [];
            if (rawRequiredArgs !== undefined) {
                if (Array.isArray(rawRequiredArgs)) {
                    requiredArgs = rawRequiredArgs.length;
                    requiredArgDefs = rawRequiredArgs.map((def, index) => {
                        if (!def || typeof def !== 'object') throw new Error(`Macro "${name}" options.requiredArgs[${index}] must be an object when using argument definitions.`);
                        if (typeof def.name !== 'string' || !def.name.trim()) throw new Error(`Macro "${name}" options.requiredArgs[${index}].name must be a non-empty string when using argument definitions.`);

                        /** @type {MacroPositionalArgDef} */
                        const normalized = {
                            name: def.name.trim(),
                            sampleValue: def.sampleValue?.trim(),
                            description: typeof def.description === 'string' ? def.description : undefined,
                            type: def.type ?? 'string',
                        };

                        if (normalized.type !== undefined
                            && normalized.type !== 'string'
                            && normalized.type !== 'integer'
                            && normalized.type !== 'number'
                            && normalized.type !== 'boolean') {
                            throw new Error(`Macro "${name}" options.requiredArgs[${index}].type must be one of "string", "integer", "number", or "boolean" when provided.`);
                        }

                        return normalized;
                    });
                } else if (typeof rawRequiredArgs === 'number') {
                    if (!Number.isInteger(rawRequiredArgs) || rawRequiredArgs < 0) {
                        throw new Error(`Macro "${name}" options.requiredArgs must be a non-negative integer when provided.`);
                    }
                    requiredArgs = rawRequiredArgs;
                    requiredArgDefs = Array.from({ length: rawRequiredArgs }, (_, i) => ({ name: `arg${i + 1}`, sampleValue: `arg${i + 1}`, type: 'string' }));
                } else {
                    throw new Error(`Macro "${name}" options.requiredArgs must be a non-negative integer or an array of argument definitions when provided.`);
                }
            }

            /** @type {{ min: number, max: (number|null) }|null} */
            let list = null;
            if (rawList !== undefined) {
                if (typeof rawList === 'boolean') {
                    list = rawList ? { min: 0, max: null } : null;
                } else if (typeof rawList === 'object' && rawList !== null) {
                    if (typeof rawList.min !== 'number' || rawList.min < 0) throw new Error(`Macro "${name}" options.list.min must be a non-negative integer when provided.`);
                    if (rawList.max !== undefined && typeof rawList.max !== 'number') throw new Error(`Macro "${name}" options.list.max must be a number when provided.`);
                    if (rawList.max !== undefined && rawList.max < rawList.min) throw new Error(`Macro "${name}" options.list.max must be greater than or equal to options.list.min.`);
                    list = { min: rawList.min, max: rawList.max ?? null };
                } else {
                    throw new Error(`Macro "${name}" options.list must be a boolean or an object with numeric min/max when provided.`);
                }
            }

            let strictArgs = true;
            if (rawStrictArgs !== undefined) {
                if (typeof rawStrictArgs !== 'boolean') throw new Error(`Macro "${name}" options.strictArgs must be a boolean when provided.`);
                strictArgs = rawStrictArgs;
            }

            let description = '<no description>';
            if (rawDescription !== undefined) {
                if (typeof rawDescription !== 'string') throw new Error(`Macro "${name}" options.description must be a string when provided.`);
                description = rawDescription;
            }

            let returns = null;
            if (rawReturns !== undefined && rawReturns !== null) {
                if (typeof rawReturns !== 'string') throw new Error(`Macro "${name}" options.returns must be a string when provided.`);
                returns = rawReturns || '<empty string>';
            }

            // Process displayOverride
            let displayOverride = null;
            if (rawDisplayOverride !== undefined && rawDisplayOverride !== null) {
                if (typeof rawDisplayOverride !== 'string') throw new Error(`Macro "${name}" options.displayOverride must be a string when provided.`);
                displayOverride = rawDisplayOverride.trim();
                if (displayOverride && !displayOverride.startsWith('{{')) {
                    logMacroRegisterWarning({ macroName: name, message: `Macro "${name}" options.displayOverride should include curly braces. Auto-wrapping.` });
                    displayOverride = `{{${displayOverride}}}`;
                }
            }

            // Process exampleUsage
            /** @type {string[]} */
            let exampleUsage = [];
            if (rawExampleUsage !== undefined && rawExampleUsage !== null) {
                const examples = Array.isArray(rawExampleUsage) ? rawExampleUsage : [rawExampleUsage];
                for (const [i, ex] of examples.entries()) {
                    if (typeof ex !== 'string') throw new Error(`Macro "${name}" options.exampleUsage[${i}] must be a string.`);
                    let trimmed = ex.trim();
                    if (trimmed && !trimmed.startsWith('{{')) {
                        logMacroRegisterWarning({ macroName: name, message: `Macro "${name}" options.exampleUsage[${i}] should include curly braces. Auto-wrapping.` });
                        trimmed = `{{${trimmed}}}`;
                    }
                    if (trimmed) exampleUsage.push(trimmed);
                }
            }

            if (this.#macros.has(name)) {
                console.warn(`Macro "${name}" is already registered and will be overwritten.`);
            }

            // Detect extension/third-party status from call stack
            const { isExtension, isThirdParty, source } = detectMacroSource();

            /** @type {MacroDefinition} */
            const definition = {
                name: name,
                category,
                requiredArgs,
                requiredArgDefs,
                list,
                strictArgs,
                description,
                returns,
                displayOverride,
                exampleUsage,
                handler,
                source: {
                    name: source,
                    isExtension,
                    isThirdParty,
                },
            };

            this.#macros.set(name, definition);

            return definition;
        } catch (error) {
            logMacroRegisterError({
                message: `Failed to register macro "${macroName}". The macro will not be available.`,
                macroName,
                error,
            });
            return null;
        }
    }

    /**
     * Unregisters a macro.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {boolean} True if a macro was removed.
     */
    unregisterMacro(name) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('Macro name must be a non-empty string');
        name = name.trim();
        return this.#macros.delete(name);
    }

    /**
     * Checks whether a macro with the given name is registered.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {boolean}
     */
    hasMacro(name) {
        if (typeof name !== 'string' || !name.trim()) return false;
        name = name.trim();
        return this.#macros.has(name);
    }

    /**
     * Returns the macro definition for a given name.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {MacroDefinition|undefined}
     */
    getMacro(name) {
        if (typeof name !== 'string' || !name.trim()) return undefined;
        name = name.trim();
        return this.#macros.get(name);
    }

    /**
     * Returns an array of all registered macros.
     *
     * @returns {MacroDefinition[]}
     */
    getAllMacros() {
        return Array.from(this.#macros.values());
    }

    /**
     * Executes a macro for a given call.
     *
     * @param {MacroCall} call - Macro call information.
     * @param {Object} [options] - Additional options.
     * @param {MacroDefinition} [options.defOverride] - Override the macro definition.
     * @returns {string}
     */
    executeMacro(call, { defOverride } = {}) {
        const name = call.name;
        const def = defOverride || this.getMacro(name);
        if (!def) {
            throw new Error(`Macro "${name}" is not registered`);
        }

        const args = Array.isArray(call.args) ? call.args : [];

        if (!isArgsValid(def, args)) {
            const expectedMin = def.list ? def.requiredArgs + def.list.min : def.requiredArgs;
            const expectedMax = def.list && def.list.max !== null ? def.requiredArgs + def.list.max : null;

            const expectation = (() => {
                if (!def.list) return `${def.requiredArgs}`;
                if (expectedMax !== null && expectedMax !== expectedMin) return `between ${expectedMin} and ${expectedMax}`;
                if (expectedMax !== null && expectedMax === expectedMin) return `${expectedMin}`;
                return `at least ${expectedMin}`;
            })();

            const message = `Macro "${def.name}" called with ${args.length} unnamed arguments but expects ${expectation}.`;
            if (def.strictArgs) {
                throw createMacroRuntimeError({ message, call, def });
            }
            logMacroRuntimeWarning({ message, call, def });
        }

        const requiredArgsValues = args.slice(0, Math.min(def.requiredArgs, args.length));
        const listValues = !def.list ? null : args.length > def.requiredArgs ? args.slice(def.requiredArgs) : [];

        // Perform best-effort type validation for documented positional arguments.
        // This can throw an error if the arguments are invalid.
        validateArgTypes(call, def, requiredArgsValues);

        const namedArgs = null;

        /** @type {MacroExecutionContext} */
        const executionContext = {
            name: def.name,
            args,
            requiredArgs: requiredArgsValues,
            list: listValues,
            namedArgs,
            raw: call.rawInner,
            env: call.env,
            cstNode: call.cstNode,
            range: call.range,
            normalize: MacroEngine.normalizeMacroResult.bind(MacroEngine),
        };

        const result = def.handler(executionContext);
        return executionContext.normalize(result);
    }
}

instance = MacroRegistry.instance;

/**
 * Validates the arguments for a macro definition.
 *
 * @param {MacroDefinition} def - Macro definition.
 * @param {any[]} args - Arguments to validate.
 * @returns {boolean} True if the arguments are valid, false otherwise.
 */
function isArgsValid(def, args) {
    const hasListArgs = def.list !== null;
    if (!hasListArgs) return args.length === def.requiredArgs;

    const argsShorterThanMin = args.length < def.requiredArgs + def.list.min;
    if (argsShorterThanMin) return false;

    const listCount = args.length > def.requiredArgs ? args.length - def.requiredArgs : 0;
    const argsLongerThanMax = def.list.max !== null && listCount > def.list.max;
    if (argsLongerThanMax) return false;
    return true;
}

/**
 * Performs type validation for positional arguments using the metadata
 * defined on the macro definition. When strictArgs is true, invalid argument
 * types cause an error to be thrown. When strictArgs is false, only warnings
 * are logged and execution continues.
 *
 * @param {MacroCall} call
 * @param {MacroDefinition} def
 * @param {string[]} requiredArgs
 */
function validateArgTypes(call, def, requiredArgs) {
    if (def.requiredArgDefs.length === 0) return;

    const defs = def.requiredArgDefs;
    const count = Math.min(defs.length, requiredArgs.length);
    for (let i = 0; i < count; i++) {
        const argDef = defs[i];
        const value = requiredArgs[i];
        if (!argDef || !argDef.type || typeof value !== 'string') {
            // Misconfigured macro definition: always surface as an error.
            throw new Error(`Macro "${call.name}" (position ${i + 1}) has invalid definition or type.`);
        }

        if (!isValueOfType(value, argDef.type)) {
            const argName = argDef.name || `Argument ${i + 1}`;
            const message = `Macro "${call.name}" (position ${i + 1}) argument "${argName}" expected type ${argDef.type} but got value "${value}".`;
            if (def.strictArgs) {
                throw createMacroRuntimeError({ message, call, def: def });
            }
            logMacroRuntimeWarning({ message, call, def: def });
        }
    }
}

/**
 * Checks whether a string value conforms to the given macro argument type.
 *
 * @param {string} value
 * @param {MacroArgType} type
 * @returns {boolean}
 */
function isValueOfType(value, type) {
    const trimmed = value.trim();

    if (type === 'string') {
        return true;
    }
    if (type === 'integer') {
        return /^-?\d+$/.test(trimmed);
    }
    if (type === 'number') {
        const n = Number(trimmed);
        return Number.isFinite(n);
    }
    if (type === 'boolean') {
        return isTrueBoolean(trimmed) || isFalseBoolean(trimmed);
    }

    // Unknown type: treat it as invalid.
    return false;
}

/**
 * Detects the source of a macro registration from the call stack.
 * Similar to how SlashCommandParser detects command sources.
 *
 * @returns {{ isExtension: boolean, isThirdParty: boolean, source: string }}
 */
function detectMacroSource() {
    const stack = new Error().stack?.split('\n').map(line => line.trim()) ?? [];

    const isExtension = stack.some(line => line.includes('/scripts/extensions/'));
    const isThirdParty = stack.some(line => line.includes('/scripts/extensions/third-party/'));

    let source = 'unknown';
    if (isThirdParty) {
        const match = stack.find(line => line.includes('/scripts/extensions/third-party/'));
        if (match) {
            source = match.replace(/^.*?\/scripts\/extensions\/third-party\/([^/]+)\/.*$/, '$1');
        }
    } else if (isExtension) {
        const match = stack.find(line => line.includes('/scripts/extensions/'));
        if (match) {
            source = match.replace(/^.*?\/scripts\/extensions\/([^/]+)\/.*$/, '$1');
        }
    } else {
        // Find the first meaningful caller outside MacroRegistry
        const callerIdx = stack.findIndex(line =>
            line.includes('registerMacro') && line.includes('MacroRegistry'),
        );
        if (callerIdx >= 0 && callerIdx + 1 < stack.length) {
            const callerLine = stack[callerIdx + 1];
            // Extract script path from stack frame
            const scriptMatch = callerLine.match(/\/((?:scripts\/)?(?:macros\/)?[^/]+\.js)/);
            if (scriptMatch) {
                source = scriptMatch[1];
            }
        }
    }

    return { isExtension, isThirdParty, source };
}
