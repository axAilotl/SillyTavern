import { MacroRegistry } from './MacroRegistry.js';
import {
    getLocalVariable,
    setLocalVariable,
    getGlobalVariable,
    setGlobalVariable,
    addLocalVariable,
    addGlobalVariable,
    incrementLocalVariable,
    incrementGlobalVariable,
    decrementLocalVariable,
    decrementGlobalVariable,
} from '../variables.js';

/**
 * Registers variable-related {{...}} macros that operate on local and global
 * variables (e.g. {{setvar}}, {{getvar}}, {{incvar}}, etc.).
 */
export function registerVariableMacros() {
    // {{setvar::name::value}} -> '' (side-effect on local variable)
    MacroRegistry.registerMacro('setvar', {
        requiredArgs: 2,
        description: 'Sets a local variable to the given value.',
        handler: ({ requiredArgs: [name, value] }) => {
            setLocalVariable(name, value);
            return '';
        },
    });

    // {{addvar::name::value}} -> '' (side-effect via addLocalVariable)
    MacroRegistry.registerMacro('addvar', {
        requiredArgs: 2,
        description: 'Adds a value to an existing local variable (numeric or string append).',
        handler: ({ requiredArgs: [name, value] }) => {
            addLocalVariable(name, value);
            return '';
        },
    });

    // {{incvar::name}} -> returns new value
    MacroRegistry.registerMacro('incvar', {
        requiredArgs: 1,
        description: 'Increments a local variable by 1 and returns the new value.',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            return incrementLocalVariable(name);
        },
    });

    // {{decvar::name}} -> returns new value
    MacroRegistry.registerMacro('decvar', {
        requiredArgs: 1,
        description: 'Decrements a local variable by 1 and returns the new value.',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            return decrementLocalVariable(name);
        },
    });

    // {{getvar::name}} -> returns current value
    MacroRegistry.registerMacro('getvar', {
        requiredArgs: 1,
        description: 'Gets the value of a local variable.',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            return getLocalVariable(name);
        },
    });

    // {{setglobalvar::name::value}} -> ''
    MacroRegistry.registerMacro('setglobalvar', {
        requiredArgs: 2,
        description: 'Sets a global variable to the given value.',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const value = requiredArgs && requiredArgs.length > 1 ? requiredArgs[1] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            setGlobalVariable(name, value);
            return '';
        },
    });

    // {{addglobalvar::name::value}} -> ''
    MacroRegistry.registerMacro('addglobalvar', {
        requiredArgs: 2,
        description: 'Adds a value to an existing global variable (numeric or string append).',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const value = requiredArgs && requiredArgs.length > 1 ? requiredArgs[1] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            addGlobalVariable(name, value);
            return '';
        },
    });

    // {{incglobalvar::name}} -> returns new value
    MacroRegistry.registerMacro('incglobalvar', {
        requiredArgs: 1,
        description: 'Increments a global variable by 1 and returns the new value.',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            return incrementGlobalVariable(name);
        },
    });

    // {{decglobalvar::name}} -> returns new value
    MacroRegistry.registerMacro('decglobalvar', {
        requiredArgs: 1,
        description: 'Decrements a global variable by 1 and returns the new value.',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            return decrementGlobalVariable(name);
        },
    });

    // {{getglobalvar::name}} -> returns current value
    MacroRegistry.registerMacro('getglobalvar', {
        requiredArgs: 1,
        description: 'Gets the value of a global variable.',
        handler: ({ requiredArgs }) => {
            const nameRaw = requiredArgs && requiredArgs.length > 0 ? requiredArgs[0] : '';
            const name = String(nameRaw).trim();
            if (!name) {
                return '';
            }
            return getGlobalVariable(name);
        },
    });
}
