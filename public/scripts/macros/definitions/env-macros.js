import { MacroRegistry, MacroCategory } from '../engine/MacroRegistry.js';
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
        category: MacroCategory.NAMES,
        description: 'Your current Persona username.',
        handler: ({ env }) => env.names.user,
    });

    MacroRegistry.registerMacro('char', {
        category: MacroCategory.NAMES,
        description: 'The character\'s name.',
        handler: ({ env }) => env.names.char,
    });

    MacroRegistry.registerMacro('group', {
        category: MacroCategory.NAMES,
        description: 'Comma-separated list of group member names (including muted) or the character name in solo chats.',
        aliases: [{ alias: 'charIfNotGroup', visible: false }],
        handler: ({ env }) => env.names.group ?? '',
    });

    MacroRegistry.registerMacro('groupNotMuted', {
        category: MacroCategory.NAMES,
        description: 'Comma-separated list of group member names excluding muted members.',
        handler: ({ env }) => env.names.groupNotMuted ?? '',
    });

    MacroRegistry.registerMacro('notChar', {
        category: MacroCategory.NAMES,
        description: 'Comma-separated list of all participants except the current speaker.',
        handler: ({ env }) => env.names.notChar ?? '',
    });

    // Character card field macros (from MacroEnv.character)
    MacroRegistry.registerMacro('charPrompt', {
        category: MacroCategory.CHARACTER,
        description: 'The character\'s Main Prompt override.',
        handler: ({ env }) => env.character.charPrompt ?? '',
    });

    MacroRegistry.registerMacro('charInstruction', {
        category: MacroCategory.CHARACTER,
        description: 'The character\'s Post-History Instructions override.',
        handler: ({ env }) => env.character.charInstruction ?? '',
    });

    MacroRegistry.registerMacro('description', {
        category: MacroCategory.CHARACTER,
        description: 'The character\'s description.',
        handler: ({ env }) => env.character.description ?? '',
    });

    MacroRegistry.registerMacro('personality', {
        category: MacroCategory.CHARACTER,
        description: 'The character\'s personality.',
        handler: ({ env }) => env.character.personality ?? '',
    });

    MacroRegistry.registerMacro('scenario', {
        category: MacroCategory.CHARACTER,
        description: 'The character\'s scenario.',
        handler: ({ env }) => env.character.scenario ?? '',
    });

    MacroRegistry.registerMacro('persona', {
        category: MacroCategory.CHARACTER,
        description: 'Your current Persona description.',
        handler: ({ env }) => env.character.persona ?? '',
    });

    MacroRegistry.registerMacro('mesExamplesRaw', {
        category: MacroCategory.CHARACTER,
        description: 'Unformatted dialogue examples from the character card.',
        handler: ({ env }) => env.character.mesExamplesRaw ?? '',
    });

    MacroRegistry.registerMacro('mesExamples', {
        category: MacroCategory.CHARACTER,
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
        category: MacroCategory.CHARACTER,
        description: 'The character\'s @ Depth Note.',
        handler: ({ env }) => env.character.charDepthPrompt ?? '',
    });

    MacroRegistry.registerMacro('creatorNotes', {
        category: MacroCategory.CHARACTER,
        description: 'Creator notes from the character card.',
        handler: ({ env }) => env.character.creatorNotes ?? '',
    });

    // Character version macros (legacy variants and documented {{charVersion}})
    MacroRegistry.registerMacro('charVersion', {
        category: MacroCategory.CHARACTER,
        description: 'The character\'s version number.',
        aliases: [
            { alias: 'version', visible: false }, // Legacy alias
            { alias: 'char_version', visible: false }, // Legacy underscore variant
        ],
        handler: ({ env }) => env.character.version ?? '',
    });

    // System / env extras macros (from MacroEnv.system / MacroEnv.extra)
    MacroRegistry.registerMacro('model', {
        category: MacroCategory.STATE,
        description: 'Text generation model name for the currently selected API.',
        handler: ({ env }) => env.system.model,
    });

    // TODO: Move this to the summary extension, where it belongs
    MacroRegistry.registerMacro('summary', {
        category: MacroCategory.CHAT,
        description: 'Latest chat summary from the "Summarize" extension (when available).',
        handler: ({ env }) => {
            const value = /** @type {any} */ (env.extra).summary;
            return value == null ? '' : String(value);
        },
    });

    MacroRegistry.registerMacro('original', {
        category: MacroCategory.CHARACTER,
        description: 'Original message content for {{original}} substitution in in character prompt overrides.',
        handler: ({ env }) => {
            const value = env.functions.original();
            return value;
        },
    });

    // Device / environment macros
    MacroRegistry.registerMacro('isMobile', {
        category: MacroCategory.STATE,
        description: '"true" if currently running in a mobile environment, "false" otherwise.',
        handler: () => String(isMobile()),
    });
}
