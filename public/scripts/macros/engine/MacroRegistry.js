/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */

import { MacroEngine } from './MacroEngine.js';

/**
 * @typedef {Object} MacroExecutionContext
 * @property {string} name
 * @property {string[]} args
 * @property {string[]} [requiredArgs]
 * @property {string[]|null} [list]
 * @property {{ [key: string]: string }} [namedArgs]
 * @property {string} [raw]
 * @property {MacroEnv} [env]
 * @property {CstNode} [cstNode]
 * @property {{ startOffset: number, endOffset: number }} [range]
 * @property {(value: any) => string} normalize - Normalize function to use on unsure macro results to make sure they return strings as expected.
 */

/**
 * @typedef {Object} MacroListSpec
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * @typedef {Object} MacroDefinitionOptions
 * @property {number?} [requiredArgs=0] - Specifies the macro requires this many arguments. (defaults to 0)
 * @property {boolean|MacroListSpec?} [list=null] - Whether the macro allows a list of arguments (optional min and max values can be set). These arguments will be added AFTER the required args.
 * @property {boolean?} [strictArgs=true] - Whether the macro should be strict about its arguments.
 * @property {string?} [description=''] - Add a description of what the macro does.
 * @property {string?} [returns=null] - Add a specific description of what the macro returns, if it is not obvious from the description.
 * @property {(context: MacroExecutionContext) => (string|Promise<string>)!} handler - The handler function for the macro.
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name
 * @property {number} requiredArgs
 * @property {{ min: number, max: (number|null) }|null} list
 * @property {boolean} strictArgs
 * @property {string} description
 * @property {string?} returns
 * @property {(context: MacroExecutionContext) => (string|Promise<string>)} handler
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
     *
     * @param {string} name - Macro name (identifier).
     * @param {MacroDefinitionOptions} options - Macro registration options including handler and metadata.
     * @returns {MacroDefinition}
     */
    registerMacro(name, options) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('Macro name must be a non-empty string');
        name = name.trim();
        if (!options || typeof options !== 'object') throw new Error(`Macro "${name}" options must be a non-null object.`);

        const { handler, requiredArgs: rawRequiredArgs, list: rawList, strictArgs: rawStrictArgs, description: rawDescription, returns: rawReturns } = options;

        if (typeof handler !== 'function') throw new Error(`Macro "${name}" options.handler must be a function.`);

        let requiredArgs = 0;
        if (rawRequiredArgs !== undefined) {
            if (typeof rawRequiredArgs !== 'number' || !Number.isInteger(rawRequiredArgs) || rawRequiredArgs < 0) {
                throw new Error(`Macro "${name}" options.requiredArgs must be a non-negative integer when provided.`);
            }
            requiredArgs = rawRequiredArgs;
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

        let description = '';
        if (rawDescription !== undefined) {
            if (typeof rawDescription !== 'string') throw new Error(`Macro "${name}" options.description must be a string when provided.`);
            description = rawDescription;
        }

        let returns = null;
        if (rawReturns !== undefined && rawReturns !== null) {
            if (typeof rawReturns !== 'string') throw new Error(`Macro "${name}" options.returns must be a string when provided.`);
            returns = rawReturns;
        }

        if (this.#macros.has(name)) {
            console.warn(`Macro "${name}" is already registered and will be overwritten.`);
        }

        /** @type {MacroDefinition} */
        const definition = {
            name: name,
            requiredArgs,
            list,
            strictArgs,
            description,
            returns,
            handler,
        };

        this.#macros.set(name, definition);

        return definition;
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
     * Executes a macro by name with the provided context.
     * Handles both synchronous and asynchronous macro handlers.
     *
     * @param {string} name - Macro name (identifier).
     * @param {MacroExecutionContext} [context] - Execution context.
     * @returns {Promise<string>}
     */
    async executeMacro(name, context) {
        const def = this.getMacro(name);
        if (!def) {
            throw new Error(`Macro "${name}" is not registered`);
        }

        const args = Array.isArray(context?.args) ? context.args : [];

        if (!isArgsValid(def, args)) {
            const expectedMin = def.list ? def.requiredArgs + def.list.min : def.requiredArgs;
            const expectedMax = def.list && def.list.max !== null ? def.requiredArgs + def.list.max : null;

            const expectation = (() => {
                if (!def.list) return `${def.requiredArgs}`;
                if (expectedMax !== null && expectedMax !== expectedMin) return `between ${expectedMin} and ${expectedMax}`;
                if (expectedMax !== null && expectedMax === expectedMin) return `${expectedMin}`;
                return `at least ${expectedMin}`;
            })();
            console.warn(`Macro "${def.name}" called with ${args.length} unnamed arguments but expects ${expectation}.`);

            if (def.strictArgs) {
                const rawInner = context?.raw;
                if (typeof rawInner === 'string') {
                    return `{{${rawInner}}}`;
                }
                return '';
            }
        }

        const requiredArgsValues = args.slice(0, Math.min(def.requiredArgs, args.length));
        const listValues = !def.list ? null : args.length > def.requiredArgs ? args.slice(def.requiredArgs) : [];

        /** @type {MacroExecutionContext} */
        const executionContext = {
            name: def.name,
            args,
            requiredArgs: requiredArgsValues,
            list: listValues,
            namedArgs: context?.namedArgs,
            raw: context?.raw,
            env: context?.env,
            cstNode: context?.cstNode,
            range: context?.range,
            normalize: context?.normalize || MacroEngine.normalizeMacroResult.bind(this),
        };

        // Resolve promise, catch any errors, and normalize result
        const result = def.handler(executionContext);
        return Promise.resolve(result)
            .catch(() => {
                console.error(`Macro "${def.name}" handler failed to execute`, context);
                return '';
            })
            .then(value => executionContext.normalize(value));
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
