/** @typedef {import('./MacroCstWalker.js').MacroCall} MacroCall */
/** @typedef {import('./MacroRegistry.js').MacroDefinition} MacroDefinition */

/**
 * @typedef {Object} MacroErrorContext
 * @property {string} [macroName]
 * @property {MacroCall} [call]
 * @property {MacroDefinition} [def]
 */

/**
 * Options for creating a macro runtime error.
 *
 * @typedef {MacroErrorContext & { message: string }} MacroRuntimeErrorOptions
 */

/**
 * Options for logging macro warnings or errors.
 *
 * @typedef {MacroErrorContext & { message: string, error?: any }} MacroLogOptions
 */

/**
 * Creates an error representing a runtime macro invocation problem (such as
 * arity or type mismatches). These errors are intended to be caught by the
 * MacroEngine, which will log them as runtime warnings and leave the macro
 * raw in the evaluated text.
 *
 * @param {MacroRuntimeErrorOptions} options
 * @returns {Error}
 */
export function createMacroRuntimeError({ message, call, def, macroName }) {
    const inferredName = inferMacroName(call, def, macroName);

    const error = new Error(message);
    error.name = 'MacroRuntimeError';
    // @ts-ignore - custom tagging for downstream classification
    error.isMacroRuntimeError = true;
    // @ts-ignore - helpful metadata for debugging
    error.macroName = inferredName;
    // @ts-ignore - best-effort location information
    error.macroRange = call && call.range ? call.range : null;
    // @ts-ignore - attach raw call/definition for convenience
    if (call) error.macroCall = call;
    // @ts-ignore
    if (def) error.macroDefinition = def;

    return error;
}

/**
 * Logs a macro runtime warning with consistent, helpful context. These
 * correspond to issues in how a macro was written in the text (e.g. invalid
 * arguments), not bugs in macro definitions or the engine itself.
 *
 * @param {MacroLogOptions} options
 */
export function logMacroRuntimeWarning({ message, call, def, macroName, error }) {
    const payload = buildMacroPayload({ call, def, macroName, error });
    console.warn('[Macro] Warning:', message, payload);
}

/**
 * Logs an internal macro error (definition or engine bug) with a consistent
 * schema. These are surfaced as red errors in the console.
 *
 * @param {MacroLogOptions} options
 */
export function logMacroInternalError({ message, call, macroName, error }) {
    const payload = buildMacroPayload({ call, def: undefined, macroName, error });
    console.error('[Macro] Error:', message, payload);
}

/**
 * Builds a structured payload for macro logging.
 *
 * @param {MacroErrorContext & { error?: any }} ctx
 */
function buildMacroPayload({ call, def, macroName, error }) {
    const inferredName = inferMacroName(call, def, macroName);

    /** @type {Record<string, any>} */
    const payload = {
        macroName: inferredName,
        range: call && call.range ? call.range : null,
        raw: call && typeof call.rawInner === 'string' ? call.rawInner : null,
    };

    if (call)  payload.call = call;
    if (def)   payload.def = def;
    if (error) payload.error = error;

    return payload;
}

/**
 * Infers the most appropriate macro name from the available context.
 *
 * @param {MacroCall} [call]
 * @param {MacroDefinition} [def]
 * @param {string} [explicit]
 * @returns {string}
 */
function inferMacroName(call, def, explicit) {
    if (typeof explicit === 'string' && explicit.trim()) {
        return explicit.trim();
    }
    if (call && typeof call.name === 'string' && call.name.trim()) {
        return call.name.trim();
    }
    if (def && typeof def.name === 'string' && def.name.trim()) {
        return def.name.trim();
    }
    return 'unknown';
}
