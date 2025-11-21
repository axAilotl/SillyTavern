/** @typedef {import('chevrotain').CstNode} CstNode */

/**
 * Structured environment object passed into macro handlers.
 * This is the canonical shape going forward for macros that need
 * access to prompt context, names, character card fields, etc.
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
 * @property {(context: MacroExecutionContext) => (string|Promise<string>)!} handler - The handler function for the macro.
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name
 * @property {number} requiredArgs
 * @property {{ min: number, max: (number|null) }|null} list
 * @property {boolean} strictArgs
 * @property {string} description
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

        const { handler, requiredArgs: rawRequiredArgs, list: rawList, strictArgs: rawStrictArgs, description: rawDescription } = options;

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
        };

        // Resolve promise, or return right away
        const result = def.handler(executionContext);
        return Promise.resolve(result).then(value => normalizeMacroResult(value));
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
 * Normalizes macro results into a string.
 * This mirrors the behavior of the legacy macro system in a simplified way.
 *
 * @param {any} value
 * @returns {string}
 */
function normalizeMacroResult(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (_error) {
            return String(value);
        }
    }

    return String(value);
}
