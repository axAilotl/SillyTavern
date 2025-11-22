/**
 * Central entry point for the new macro system.
 *
 * Exposes the MacroEngine / MacroRegistry singletons and provides a
 * single registerMacros() function that wires up all built-in macro
 * definition sets (core, env, state, chat, time, variables, instruct).
 */

// Engine singletons
import { MacroEngine } from './engine/MacroEngine.js';
import { MacroRegistry } from './engine/MacroRegistry.js';
import { MacroLexer } from './engine/MacroLexer.js';
import { MacroParser } from './engine/MacroParser.js';
import { MacroCstWalker } from './engine/MacroCstWalker.js';
import { MacroEnvBuilder } from './engine/MacroEnvBuilder.js';

// Macro definition groups
import { registerCoreMacros } from './definitions/core-macros.js';
import { registerEnvMacros } from './definitions/env-macros.js';
import { registerStateMacros } from './definitions/state-macros.js';
import { registerChatMacros } from './definitions/chat-macros.js';
import { registerTimeMacros } from './definitions/time-macros.js';
import { registerVariableMacros } from './definitions/variable-macros.js';
import { registerInstructMacros } from './definitions/instruct-macros.js';


export const macros = {
    // engine singletons
    engine: MacroEngine,
    registry: MacroRegistry,
    envBuilder: MacroEnvBuilder,
    lexer: MacroLexer,
    parser: MacroParser,
    cstWalker: MacroCstWalker,
};

/**
 * Registers all built-in macros in a well-defined order.
 * Intended to be called once during app initialization.
 */
export function initRegisterMacros() {
    // Core utilities and generic helpers
    registerCoreMacros();

    // Env / character / system / extras
    registerEnvMacros();

    // Runtime state tracking (eventSource etc.)
    registerStateMacros();

    // Chat/history inspection macros
    registerChatMacros();

    // Time / date / durations
    registerTimeMacros();

    // Variable and instruct macros
    registerVariableMacros();
    registerInstructMacros();
}
