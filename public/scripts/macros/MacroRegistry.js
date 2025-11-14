/**
 * @typedef {Object} MacroExecutionContext
 * @property {string} name
 * @property {string[]} args
 * @property {{ [key: string]: string }} [namedArgs]
 * @property {string} [raw]
 * @property {object} [env]
 */

/**
 * @typedef {Object} MacroDefinitionOptions
 * @property {number} [minArgs=0]
 * @property {number|null} [maxArgs=null]
 * @property {boolean} [enforceArity=false]
 * @property {string} [description]
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name
 * @property {(context: MacroExecutionContext) => (string|Promise<string>)} handler
 * @property {number} minArgs
 * @property {number|null} maxArgs
 * @property {boolean} enforceArity
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
    /** @type {MacroRegistry} */
    static #instance;

    /** @type {MacroRegistry} */
    static get instance() {
        return MacroRegistry.#instance ?? (MacroRegistry.#instance = new MacroRegistry());
    }

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

        const minArgs = typeof options.minArgs === 'number' && options.minArgs >= 0
            ? options.minArgs
            : 0;

        const hasMaxArgs = typeof options.maxArgs === 'number';
        const maxArgs = hasMaxArgs ? options.maxArgs : null;

        if (maxArgs !== null && maxArgs < minArgs) {
            throw new Error('maxArgs must be greater than or equal to minArgs');
        }

        const enforceArity = options.enforceArity === true;
        const description = typeof options.description === 'string' ? options.description : '';

        if (this.#macros.has(normalizedName)) {
            console.warn(`Macro "${normalizedName}" is already registered and will be overwritten.`);
        }

        /** @type {MacroDefinition} */
        const definition = {
            name: normalizedName,
            handler,
            minArgs,
            maxArgs,
            enforceArity,
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

        if (definition.enforceArity) {
            const min = definition.minArgs;
            const max = definition.maxArgs;

            if (argc < min || (max !== null && argc > max)) {
                const rangeText = max !== null && min !== max
                    ? `between ${min} and ${max}`
                    : String(min);
                console.warn(`Macro "${definition.name}" called with ${argc} arguments but expects ${rangeText}.`);
            }
        }

        const executionContext = {
            name: definition.name,
            args,
            namedArgs: context?.namedArgs,
            raw: context?.raw,
            env: context?.env,
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
