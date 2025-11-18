import { MacroRegistry } from './MacroRegistry.js';

/**
 * Registers a small set of prototype macros in the global macro registry.
 *
 * These are intentionally simple and self-contained so they can be used to
 * exercise the lexer/parser/engine pipeline for:
 * - basic macros with no arguments
 * - macros with unnamed arguments (using ::, : or space syntax)
 * - nested macros (handled by the parser/engine, not the registry itself)
 */
function registerPrototypeMacros() {
    // {{ping}} -> 'pong'
    MacroRegistry.registerMacro('ping', () => 'pong', {
        requiredArgs: 0,
        description: 'Simple macro that always returns "pong".',
    });

    // {{echo::hello::world}} or {{echo: hello world}} -> 'hello world'
    MacroRegistry.registerMacro('echo', ({ args }) => {
        return Array.isArray(args) ? args.join(' ') : '';
    }, {
        requiredArgs: 0,
        list: true,
        description: 'Joins all unnamed arguments with a single space.',
    });

    // {{first::a::b::c}} or {{first: a b c}} -> 'a'
    MacroRegistry.registerMacro('first', ({ args }) => {
        if (!Array.isArray(args) || args.length === 0) {
            return '';
        }
        return args[0];
    }, {
        requiredArgs: 1,
        list: true,
        description: 'Returns the first unnamed argument.',
    });

    // {{upper::hello world}} or {{upper: hello world}} -> 'HELLO WORLD'
    MacroRegistry.registerMacro('upper', ({ args }) => {
        const value = Array.isArray(args) && args.length > 0 ? args.join(' ') : '';
        return value.toUpperCase();
    }, {
        requiredArgs: 1,
        list: true,
        description: 'Converts its unnamed arguments to upper case.',
    });

    // {{wrap::value::[::]}} or {{wrap: value [ ]}} -> '[value]'
    // Args: value, prefix, suffix (suffix defaults to prefix if omitted)
    MacroRegistry.registerMacro('wrap', ({ args }) => {
        const safeArgs = Array.isArray(args) ? args : [];
        const value = safeArgs[0] ?? '';
        const prefix = safeArgs[1] ?? '';
        const suffix = safeArgs.length >= 3 ? safeArgs[2] : prefix;
        return `${prefix}${value}${suffix}`;
    }, {
        requiredArgs: 1,
        list: { min: 0, max: 2 },
        description: 'Wraps the first argument in an optional prefix/suffix.',
    });
}

export { registerPrototypeMacros };
