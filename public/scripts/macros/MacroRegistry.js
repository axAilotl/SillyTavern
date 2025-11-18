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
 * @property {number} [requiredArgs]
 * @property {boolean|MacroListSpec} [list]
 * @property {boolean} [strictArgs]
 * @property {string} [description]
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
     * @param {(context: MacroExecutionContext) => (string|Promise<string>)} handler - Macro implementation.
     * @param {MacroDefinitionOptions} [options] - Additional macro metadata.
     * @returns {MacroDefinition}
     */
    registerMacro(name, handler, options = {}) {
        if (typeof name !== 'string') {
            throw new Error('Macro name must be a string');
        }

        const normalizedName = name.trim();
        if (!normalizedName) {
            throw new Error('Macro name must not be empty or whitespace only');
        }

        if (typeof handler !== 'function') {
            throw new Error('Macro handler must be a function');
        }

        const requiredArgs = typeof options.requiredArgs === 'number' && options.requiredArgs >= 0
            ? options.requiredArgs
            : 0;

        /** @type {{ min: number, max: (number|null) }|null} */
        let list = null;
        if (options.list === true) {
            list = { min: 0, max: null };
        } else if (options.list && typeof options.list === 'object') {
            const min = typeof options.list.min === 'number' && options.list.min >= 0 ? options.list.min : 0;
            const hasMax = typeof options.list.max === 'number';
            const max = hasMax ? options.list.max : null;

            if (max !== null && max < min) {
                throw new Error('list.max must be greater than or equal to list.min');
            }

            list = { min, max };
        }

        const strictArgs = options.strictArgs !== false;
        const description = typeof options.description === 'string' ? options.description : '';

        if (this.#macros.has(normalizedName)) {
            console.warn(`Macro "${normalizedName}" is already registered and will be overwritten.`);
        }

        /** @type {MacroDefinition} */
        const definition = {
            name: normalizedName,
            handler,
            requiredArgs,
            list,
            strictArgs,
            description,
        };

        this.#macros.set(normalizedName, definition);

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
