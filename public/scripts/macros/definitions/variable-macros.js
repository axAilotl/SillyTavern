import { MacroRegistry } from '../engine/MacroRegistry.js';

/**
 * Registers variable-related {{...}} macros that operate on local and global
 * variables (e.g. {{setvar}}, {{getvar}}, {{incvar}}, etc.).
 */
export function registerVariableMacros() {
    const ctx = SillyTavern.getContext();

    // {{setvar::name::value}} -> '' (side-effect on local variable)
    MacroRegistry.registerMacro('setvar', {
        requiredArgs: 2,
        description: 'Sets a local variable to the given value.',
        returns: '',
        handler: ({ requiredArgs: [name, value] }) => {
            ctx.variables.local.set(name, value);
            return '';
        },
    });

    // {{addvar::name::value}} -> '' (side-effect via addLocalVariable)
    MacroRegistry.registerMacro('addvar', {
        requiredArgs: 2,
        description: 'Adds a value to an existing local variable (numeric or string append). If the variable does not exist, it will be created.',
        returns: '',
        handler: ({ requiredArgs: [name, value] }) => {
            ctx.variables.local.add(name, value);
            return '';
        },
    });

    // {{incvar::name}} -> returns new value
    MacroRegistry.registerMacro('incvar', {
        requiredArgs: 1,
        description: 'Increments a local variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        handler: ({ requiredArgs: [name], normalize }) => {
            const result = ctx.variables.local.inc(name);
            return normalize(result);
        },
    });

    // {{decvar::name}} -> returns new value
    MacroRegistry.registerMacro('decvar', {
        requiredArgs: 1,
        description: 'Decrements a local variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        handler: ({ requiredArgs: [name], normalize }) => {
            const result = ctx.variables.local.dec(name);
            return normalize(result);
        },
    });

    // {{getvar::name}} -> returns current value
    MacroRegistry.registerMacro('getvar', {
        requiredArgs: 1,
        description: 'Gets the value of a local variable.',
        handler: ({ requiredArgs: [name], normalize }) => {
            const result = ctx.variables.local.get(name);
            return normalize(result);
        },
    });

    // {{setglobalvar::name::value}} -> ''
    MacroRegistry.registerMacro('setglobalvar', {
        requiredArgs: 2,
        description: 'Sets a global variable to the given value.',
        returns: '',
        handler: ({ requiredArgs: [name, value] }) => {
            ctx.variables.global.set(name, value);
            return '';
        },
    });

    // {{addglobalvar::name::value}} -> ''
    MacroRegistry.registerMacro('addglobalvar', {
        requiredArgs: 2,
        description: 'Adds a value to an existing global variable (numeric or string append). If the variable does not exist, it will be created.',
        returns: '',
        handler: ({ requiredArgs: [name, value] }) => {
            ctx.variables.global.add(name, value);
            return '';
        },
    });

    // {{incglobalvar::name}} -> returns new value
    MacroRegistry.registerMacro('incglobalvar', {
        requiredArgs: 1,
        description: 'Increments a global variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        handler: ({ requiredArgs: [name], normalize }) => {
            const result = ctx.variables.global.inc(name);
            return normalize(result);
        },
    });

    // {{decglobalvar::name}} -> returns new value
    MacroRegistry.registerMacro('decglobalvar', {
        requiredArgs: 1,
        description: 'Decrements a global variable by 1 and returns the new value. If the variable does not exist, it will be created.',
        handler: ({ requiredArgs: [name], normalize }) => {
            const result = ctx.variables.global.dec(name);
            return normalize(result);
        },
    });

    // {{getglobalvar::name}} -> returns current value
    MacroRegistry.registerMacro('getglobalvar', {
        requiredArgs: 1,
        description: 'Gets the value of a global variable.',
        handler: ({ requiredArgs: [name], normalize }) => {
            const result = ctx.variables.global.get(name);
            return normalize(result);
        },
    });
}
