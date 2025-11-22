import { MacroLexer } from './MacroLexer.js';
import { MacroParser } from './MacroParser.js';
import { MacroCstWalker } from './MacroCstWalker.js';
import { MacroRegistry } from './MacroRegistry.js';

/** @typedef {import('./MacroCstWalker.js').MacroCall} MacroCall */

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
     * @param {any} env - The environment to pass to the macro handler.
     * @returns {Promise<string>} The resolved string.
     */
    async evaluate(input, env) {
        if (!input) {
            return '';
        }

        // Step 1: Pre-process the input to handle legacy regex macros that still need to run
        const preProcessed = MacroParser.preProcessFixLegacyMacros(input);

        // Step 2: Tokenize via lexer, so we can walk the tokens with the parsers
        const lexingResult = MacroLexer.tokenize(preProcessed);
        if (lexingResult.errors && lexingResult.errors.length > 0) {
            // For now, we log and still try to process what we can.
            console.warn('Macro lexing errors detected:', lexingResult.errors);
        }

        // Step 3: Parse the tokens into a CST structure via the parser
        MacroParser.input = lexingResult.tokens;
        const cst = MacroParser.document();

        if (MacroParser.errors && MacroParser.errors.length > 0) {
            console.warn('Macro parsing errors detected:', MacroParser.errors);
        }

        // Step 4: Evaluate the CST structure and resolve any macros.
        // Freeze the environment to avoid accidental mutations inside
        // macro handlers while still allowing the caller to pass in a
        // plain, mutable object.
        const safeEnv = env && typeof env === 'object' ? Object.freeze({ ...env }) : undefined;

        const result = await MacroCstWalker.evaluateDocument({
            text: preProcessed,
            cst,
            env: safeEnv,
            resolveMacro: this.#resolveMacro.bind(this),
        });
        return result;
    }

    /**
     * Resolves a macro call.
     *
     * @param {MacroCall} call - The macro call to resolve.
     * @returns {Promise<string>} The resolved macro
     */
    async #resolveMacro(call) {
        const { name } = call;

        if (!name) {
            return call.rawWithBraces || '';
        }

        if (!MacroRegistry.hasMacro(name)) {
            return `{{${call.rawInner}}}`; // Unknown macro: keep macro syntax, but nested macros inside rawInner are already resolved.
        }

        const result = await MacroRegistry.executeMacro(name, {
            name,
            args: call.args,
            raw: call.rawInner,
            env: call.env,
            cstNode: call.cstNode,
            range: call.range,
            normalize: this.normalizeMacroResult.bind(this),
        });
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
