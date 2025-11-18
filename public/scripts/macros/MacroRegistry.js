/** @typedef {import('chevrotain').CstNode} CstNode */

/**
 * @typedef {Object} MacroExecutionContext
 * @property {string} name
 * @property {string[]} args
 * @property {string[]} [requiredArgs]
 * @property {string[]|null} [list]
 * @property {{ [key: string]: string }} [namedArgs]
 * @property {string} [raw]
 * @property {object} [env]
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
 * @property {(context: MacroExecutionContext) => (string|Promise<string>)} handler
 * @property {number?} [requiredArgs]
 * @property {boolean|MacroListSpec?} [list]
 * @property {boolean?} [strictArgs]
 * @property {string?} [description]
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name
 * @property {(context: MacroExecutionContext) => (string|Promise<string>)} handler
 * @property {number} requiredArgs
 * @property {{ min: number, max: (number|null) }|null} list
 * @property {boolean} strictArgs
 * @property {string} description
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
            handler,
            requiredArgs,
            list,
            strictArgs,
            description,
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
        if (typeof name !== 'string') {
            throw new Error('Macro name must be a string');
        }

        const normalizedName = name.trim();

        if (!normalizedName) {
            throw new Error('Macro name must not be empty or whitespace only');
        }

        return this.#macros.delete(normalizedName);
    }

    /**
     * Checks whether a macro with the given name is registered.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {boolean}
     */
    hasMacro(name) {
        if (typeof name !== 'string') {
            return false;
        }

        const normalizedName = name.trim();

        if (!normalizedName) {
            return false;
        }

        return this.#macros.has(normalizedName);
    }

    /**
     * Returns the macro definition for a given name.
     *
     * @param {string} name - Macro name (identifier).
     * @returns {MacroDefinition|undefined}
     */
    getMacro(name) {
        if (typeof name !== 'string') {
            return undefined;
        }

        const normalizedName = name.trim();

        if (!normalizedName) {
            return undefined;
        }

        return this.#macros.get(normalizedName);
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
     * @returns {string|Promise<string>}
     */
    executeMacro(name, context) {
        const definition = this.getMacro(name);

        if (!definition) {
            throw new Error(`Macro "${name}" is not registered`);
        }

        const args = Array.isArray(context?.args) ? context.args : [];
        const argc = args.length;

        const requiredArgs = definition.requiredArgs;
        const listSpec = definition.list;

        let isValid = true;
        if (!listSpec) {
            if (argc !== requiredArgs) {
                isValid = false;
            }
        } else {
            const listCount = argc > requiredArgs ? argc - requiredArgs : 0;
            const minTotal = requiredArgs + listSpec.min;

            if (argc < minTotal) {
                isValid = false;
            }

            if (listSpec.max !== null && listCount > listSpec.max) {
                isValid = false;
            }
        }

        if (!isValid) {
            const expectedMin = listSpec ? requiredArgs + listSpec.min : requiredArgs;
            const expectedMax = listSpec && listSpec.max !== null ? requiredArgs + listSpec.max : null;

            let expectation;
            if (!listSpec) {
                expectation = String(requiredArgs);
            } else if (expectedMax !== null && expectedMax !== expectedMin) {
                expectation = `between ${expectedMin} and ${expectedMax}`;
            } else if (expectedMax !== null && expectedMax === expectedMin) {
                expectation = String(expectedMin);
            } else {
                expectation = `at least ${expectedMin}`;
            }

            console.warn(`Macro "${definition.name}" called with ${argc} unnamed arguments but expects ${expectation}.`);

            if (definition.strictArgs) {
                const rawInner = context?.raw;
                if (typeof rawInner === 'string') {
                    return `{{${rawInner}}}`;
                }
                return '';
            }
        }

        const requiredArgsValues = args.slice(0, Math.min(requiredArgs, argc));
        /** @type {string[]|null} */
        let listValues = null;
        if (listSpec) {
            listValues = argc > requiredArgs ? args.slice(requiredArgs) : [];
        }

        const executionContext = {
            name: definition.name,
            args,
            requiredArgs: requiredArgsValues,
            list: listValues,
            namedArgs: context?.namedArgs,
            raw: context?.raw,
            env: context?.env,
            cstNode: context?.cstNode,
            range: context?.range,
        };

        const result = definition.handler(executionContext);

        if (result instanceof Promise) {
            return result.then(value => normalizeMacroResult(value));
        }

        return normalizeMacroResult(result);
    }
}

instance = MacroRegistry.instance;

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
