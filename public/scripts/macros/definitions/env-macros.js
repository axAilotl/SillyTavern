import { MacroRegistry } from '../engine/MacroRegistry.js';
import { isMobile } from '../../RossAscends-mods.js';
import { parseMesExamples, main_api } from '../../../script.js';
import { power_user } from '../../power-user.js';
import { formatInstructModeExamples } from '../../instruct-mode.js';

/** @typedef {import('../engine/MacroEnv.types.js').MacroEnv} MacroEnv */

/**
 * Registers macros that mostly act as simple accessors to MacroEnv fields
 * (names, character card fields, system metadata, extras) or basic
 * environment flags.
 */
export function registerEnvMacros() {
    // Names and participant macros (from MacroEnv.names)
    MacroRegistry.registerMacro('user', {
        description: 'Your current Persona username.',
        handler: ({ env }) => env.names.user,
    });

    MacroRegistry.registerMacro('char', {
        description: 'The character\'s name.',
        handler: ({ env }) => env.names.char,
    });

    MacroRegistry.registerMacro('group', {
        description: 'Comma-separated list of group member names (including muted) or the character name in solo chats.',
        handler: ({ env }) => env.names.group ?? '',
    });

    MacroRegistry.registerMacro('groupNotMuted', {
        description: 'Comma-separated list of group member names excluding muted members.',
        handler: ({ env }) => env.names.groupNotMuted ?? '',
    });

    MacroRegistry.registerMacro('notChar', {
        description: 'Comma-separated list of all participants except the current speaker.',
        handler: ({ env }) => env.names.notChar ?? '',
    });

    // Alias used in legacy docs: behaves like {{group}} / {{charIfNotGroup}}
    MacroRegistry.registerMacro('charIfNotGroup', {
        description: 'Alias for {{group}} in solo chats; behaves like the group macro.',
        handler: ({ env }) => env.names.group ?? '',
    });

    // Character card field macros (from MacroEnv.character)
    MacroRegistry.registerMacro('charPrompt', {
        description: 'The character\'s Main Prompt override.',
        handler: ({ env }) => env.character.charPrompt ?? '',
    });

    MacroRegistry.registerMacro('charInstruction', {
        description: 'The character\'s Post-History Instructions override.',
        handler: ({ env }) => env.character.charInstruction ?? '',
    });

    MacroRegistry.registerMacro('description', {
        description: 'The character\'s description.',
        handler: ({ env }) => env.character.description ?? '',
    });

    MacroRegistry.registerMacro('personality', {
        description: 'The character\'s personality.',
        handler: ({ env }) => env.character.personality ?? '',
    });

    MacroRegistry.registerMacro('scenario', {
        description: 'The character\'s scenario.',
        handler: ({ env }) => env.character.scenario ?? '',
    });

    MacroRegistry.registerMacro('persona', {
        description: 'Your current Persona description.',
        handler: ({ env }) => env.character.persona ?? '',
    });

    MacroRegistry.registerMacro('mesExamplesRaw', {
        description: 'Unformatted dialogue examples from the character card.',
        handler: ({ env }) => env.character.mesExamplesRaw ?? '',
    });

    MacroRegistry.registerMacro('mesExamples', {
        description: 'The character\'s dialogue examples, formatted for instruct mode when enabled.',
        handler: ({ env }) => {
            const raw = env.character.mesExamplesRaw ?? '';
            if (!raw) return '';

            const isInstruct = !!power_user?.instruct?.enabled && main_api !== 'openai';
            const parsed = parseMesExamples(raw, isInstruct);

            if (!Array.isArray(parsed) || parsed.length === 0) {
                return '';
            }
            if (!isInstruct) {
                return parsed.join('');
            }

            const formatted = formatInstructModeExamples(parsed, env.names.user, env.names.char);
            return Array.isArray(formatted) ? formatted.join('') : '';
        },
    });

    MacroRegistry.registerMacro('charDepthPrompt', {
        description: 'The character\'s @ Depth Note.',
        handler: ({ env }) => env.character.charDepthPrompt ?? '',
    });

    MacroRegistry.registerMacro('creatorNotes', {
        description: 'Creator notes from the character card.',
        handler: ({ env }) => env.character.creatorNotes ?? '',
    });

    // Character version macros (legacy variants and documented {{version}})
    MacroRegistry.registerMacro('version', {
        description: 'The character\'s version number.',
        handler: ({ env }) => env.character.version ?? '',
    });

    MacroRegistry.registerMacro('charVersion', {
        description: 'Alias for the character\'s version number.',
        handler: ({ env }) => env.character.version ?? '',
    });

    MacroRegistry.registerMacro('char_version', {
        description: 'Legacy alias for the character\'s version number.',
        handler: ({ env }) => env.character.version ?? '',
    });

    // System / env extras macros (from MacroEnv.system / MacroEnv.extra)
    MacroRegistry.registerMacro('model', {
        description: 'Text generation model name for the currently selected API.',
        handler: ({ env }) => env.system.model,
    });

    // TODO: Move this to the summary extension, where it belongs
    MacroRegistry.registerMacro('summary', {
        description: 'Latest chat summary from the "Summarize" extension (when available).',
        handler: ({ env }) => {
            const value = /** @type {any} */ (env.extra).summary;
            return value == null ? '' : String(value);
        },
    });

    MacroRegistry.registerMacro('original', {
        description: 'Original message content for {{original}} substitution in in character prompt overrides.',
        handler: ({ env }) => {
            const value = env.functions.original();
            return value;
        },
    });

    // Device / environment macros
    MacroRegistry.registerMacro('isMobile', {
        description: '"true" if currently running in a mobile environment, "false" otherwise.',
        handler: () => String(isMobile()),
    });
}
