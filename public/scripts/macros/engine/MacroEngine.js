import { MacroParser } from './MacroParser.js';
import { MacroCstWalker } from './MacroCstWalker.js';
import { MacroRegistry } from './MacroRegistry.js';
import { logMacroInternalError, logMacroRuntimeWarning, logMacroSyntaxWarning } from './MacroDiagnostics.js';

/** @typedef {import('./MacroCstWalker.js').MacroCall} MacroCall */
/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */
/** @typedef {import('./MacroRegistry.js').MacroDefinition} MacroDefinition */

/**
 * The singleton instance of the MacroEngine.
 *
 * @type {MacroEngine}
 */
let instance;
export { instance as MacroEngine };

class MacroEngine {
    /** @type {MacroEngine} */ static #instance;
    /** @type {MacroEngine} */ static get instance() { return MacroEngine.#instance ?? (MacroEngine.#instance = new MacroEngine()); }

    constructor() { }

    /**
     * Evaluates a string containing macros and resolves them.
     *
     * @param {string} input - The input string to evaluate.
     * @param {MacroEnv} env - The environment to pass to the macro handler.
     * @returns {string} The resolved string.
     */
    evaluate(input, env) {
        if (!input) {
            return '';
        }
        const safeEnv = Object.freeze({ ...env });

        const preProcessed = this.#runPreProcessors(input, safeEnv);

        const { cst, lexingErrors, parserErrors } = MacroParser.parseDocument(preProcessed);

        // For now, we log and still try to process what we can.
        if (lexingErrors && lexingErrors.length > 0) {
            logMacroSyntaxWarning({ phase: 'lexing', input, errors: lexingErrors });
        }
        if (parserErrors && parserErrors.length > 0) {
            logMacroSyntaxWarning({ phase: 'parsing', input, errors: parserErrors });
        }

        const evaluated = MacroCstWalker.evaluateDocument({
            text: preProcessed,
            cst,
            env: safeEnv,
            resolveMacro: this.#resolveMacro.bind(this),
        });

        const result = this.#runPostProcessors(evaluated, safeEnv);

        return result;
    }

    /**
     * Resolves a macro call.
     *
     * @param {MacroCall} call - The macro call to resolve.
     * @returns {string} The resolved macro.
     */
    #resolveMacro(call) {
        const { name, env } = call;

        const raw = `{{${call.rawInner}}}`;
        if (!name) return raw;

        // First check if this is a dynamic macro to use. If so, we will create a temporary macro definition for it and use that over any registered macro.
        /** @type {MacroDefinition?} */
        let defOverride = null;
        if (Object.hasOwn(env.dynamicMacros, name)) {
            const impl = env.dynamicMacros[name];
            defOverride = {
                name,
                description: 'Dynamic macro',
                requiredArgs: 0,
                requiredArgDefs: [],
                list: null,
                strictArgs: true, // Fail dynamic macros if they are called with arguments
                returns: null,
                handler: typeof impl === 'function' ? impl : () => impl,
            };
        }

        // If not, check if the macro exists and is registered
        if (!defOverride && !MacroRegistry.hasMacro(name)) {
            return raw; // Unknown macro: keep macro syntax, but nested macros inside rawInner are already resolved.
        }

        try {
            const result = MacroRegistry.executeMacro(call, { defOverride });

            try {
                return call.env.functions.postProcess(result);
            } catch (error) {
                logMacroInternalError({ message: `Macro "${name}" postProcess function failed.`, call, error });
                return result;
            }
        } catch (error) {
            const isRuntimeError = !!(error && (error.name === 'MacroRuntimeError' || error.isMacroRuntimeError));
            if (isRuntimeError) {
                logMacroRuntimeWarning({ message: (error.message || `Macro "${name}" execution failed.`), call, error });
            } else {
                logMacroInternalError({ message: `Macro "${name}" internal execution error.`, call, error });
            }
            return raw;
        }
    }

    /**
     * Runs pre-processors on the input text, before the engine processes the input.
     *
     * @param {string} text - The input text to process.
     * @param {MacroEnv} env - The environment to pass to the macro handler.
     * @returns {string} The processed text.
     */
    #runPreProcessors(text, env) {
        let result = text;

        // This legacy macro will not be supported by the new macro parser, but rather regex-replaced beforehand
        // {{time_UTC-10}}   =>   {{time::UTC-10}}
        result = result.replace(/{{time_(UTC[+-]\d+)}}/gi, (_match, utcOffset) => {
            return `{{time::${utcOffset}}}`;
        });

        return result;
    }

    /**
     * Runs post-processors on the input text, after the engine finished processing the input.
     *
     * @param {string} text - The input text to process.
     * @param {MacroEnv} env - The environment to pass to the macro handler.
     * @returns {string} The processed text.
     */
    #runPostProcessors(text, env) {
        let result = text;

        // The original trim macro is reaching over the boundaries of the defined macro. This is not something the engine supports.
        // To treat {{trim}} as it was before, we won't process it by the engine itself,
        // but doing a regex replace on {{trim}} and the surrounding area, after all other macros have been processed.
        result = result.replace(/(?:\r?\n)*{{trim}}(?:\r?\n)*/gi, '');

        return result;
    }

    /**
    * Normalizes macro results into a string.
    * This mirrors the behavior of the legacy macro system in a simplified way.
    *
    * @param {any} value
    * @returns {string}
    */
    normalizeMacroResult(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (typeof value === 'object' || Array.isArray(value)) {
            try {
                return JSON.stringify(value);
            } catch (_error) {
                return String(value);
            }
        }

        return String(value);
    }
}

instance = MacroEngine.instance;
