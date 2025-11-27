import { seedrandom, droll } from '../../../lib.js';
import { chat_metadata, main_api, getMaxContextSize, extension_prompts, getCurrentChatId } from '../../../script.js';
import { getStringHash } from '../../utils.js';
import { textgenerationwebui_banned_in_macros } from '../../textgen-settings.js';
import { inject_ids } from '../../constants.js';
import { MacroRegistry } from '../engine/MacroRegistry.js';

/**
 * Registers SillyTavern's core built-in macros in the MacroRegistry.
 *
 * These macros correspond to the main {{...}} macros that are available
 * in prompts (time/date/chat info, utility macros, etc.). They are
 * intended to preserve the behavior of the existing regex-based macros
 * in macros.js while using the new MacroRegistry/MacroEngine pipeline.
 */
export function registerCoreMacros() {
    // {{newline}} -> '\n'
    MacroRegistry.registerMacro('newline', {
        description: 'Inserts a newline character.',
        handler: () => '\n',
    });

    // {{noop}} -> ''
    MacroRegistry.registerMacro('noop', {
        description: 'Does nothing and produces an empty string.',
        handler: () => '',
    });

    // {{trim}} -> macro will currently replace itself with itself. Trimming is handled in post-processing.
    MacroRegistry.registerMacro('trim', {
        description: 'Trims whitespace from the argument provided.',
        handler: () => '{{trim}}',
    });

    // {{input}} -> current textarea content
    MacroRegistry.registerMacro('input', {
        description: 'Current text from the send textarea.',
        handler: () => (/** @type {HTMLTextAreaElement} */(document.querySelector('#send_textarea')))?.value ?? '',
    });

    // {{maxPrompt}} -> max context size
    MacroRegistry.registerMacro('maxPrompt', {
        description: 'Maximum prompt context size.',
        handler: () => String(getMaxContextSize()),
    });

    // String utilities
    MacroRegistry.registerMacro('reverse', {
        requiredArgs: 1,
        description: 'Reverses the characters of the argument provided.',
        handler: ({ requiredArgs: [value] }) => Array.from(value).reverse().join(''),
    });

    // Comment macro: {{// ...}} -> '' (consumes any arguments)
    MacroRegistry.registerMacro('//', {
        list: true,         // We consume any arguments as if this is a list, but we'll ignore them in the handler anyway
        strictArgs: false,  // and we also always remove it, even if the parsing might say it's invalid
        description: 'Comment macro that produces an empty string. Can be used for writing into prompt definitions, without being passed to the context.',
        handler: () => '',
    });

    // Time and date macros
    // Dice roll macro: {{roll 1d6}} or {{roll: 1d6}}
    MacroRegistry.registerMacro('roll', {
        requiredArgs: [
            {
                name: 'formula',
                sampleValue: '1d20',
                description: 'Dice roll formula using droll syntax (e.g. 1d20).',
                type: 'string',
            },
        ],
        description: 'Rolls dice using droll syntax (e.g. {{roll 1d20}}).',
        handler: ({ requiredArgs: [formula] }) => {
            // If only digits were provided, treat it as `1dX`.
            if (/^\d+$/.test(formula)) {
                formula = `1d${formula}`;
            }

            const isValid = droll.validate(formula);
            if (!isValid) {
                console.debug(`Invalid roll formula: ${formula}`);
                return '';
            }

            const result = droll.roll(formula);
            if (result === false) return '';
            return String(result.total);
        },
    });

    // Random choice macro: {{random::a::b}} or {{random a,b}}
    MacroRegistry.registerMacro('random', {
        list: true,
        description: 'Picks a random item from a list. Will be re-rolled every time macros are resolved.',
        handler: ({ list, raw: rawListString }) => {
            // We let double-colon args be handled by the list argument parser
            // But for the ancient legacy comma separated list, we'll fall back to the raw argument and split via the old logic
            if (list.length === 1) {
                list = rawListString
                    .replace(/\\,/g, '##�COMMA�##')
                    .split(',')
                    .map(item => item.trim().replace(/##�COMMA�##/g, ','));
            }

            if (list.length === 0) {
                return '';
            }

            const rng = seedrandom('added entropy.', { entropy: true });
            const randomIndex = Math.floor(rng() * list.length);
            return list[randomIndex];
        },
    });

    // Deterministic choice macro: {{pick::a::b}} or {{pick a,b}}
    MacroRegistry.registerMacro('pick', {
        list: true,
        description: 'Picks a random item from a list, but keeps the choice stable for a given chat and macro position.',
        handler: ({ list, raw: rawListString, range, env }) => {
            /** @type {string[]} */
            let items = Array.isArray(list) ? [...list] : [];

            // Legacy comma-separated syntax: {{pick: a, b, c}}
            if (items.length === 1 && typeof rawListString === 'string') {
                items = rawListString
                    .replace(/\\,/g, '##�COMMA�##')
                    .split(',')
                    .map(item => item.trim().replace(/##�COMMA�##/g, ','));
            }

            if (!items.length) {
                return '';
            }

            const chatIdHash = getChatIdHash();

            // Use the full original input string for deterministic behavior
            const rawContentHash = getStringHash(env.content);

            const offset = typeof range?.startOffset === 'number' ? range.startOffset : 0;

            const combinedSeedString = `${chatIdHash}-${rawContentHash}-${offset}`;
            const finalSeed = getStringHash(combinedSeedString);
            const rng = seedrandom(String(finalSeed));
            const randomIndex = Math.floor(rng() * items.length);
            return items[randomIndex];
        },
    });

    // Banned words macro: {{banned "word"}}
    MacroRegistry.registerMacro('banned', {
        requiredArgs: [
            {
                name: 'word',
                sampleValue: 'word',
                description: 'Word to ban for textgenerationwebui backend.',
                type: 'string',
            },
        ],
        description: 'Bans a word for textgenerationwebui backend. (Strips quotes surrounding the banned word, if present)',
        returns: 'Empty string',
        handler: ({ requiredArgs: [bannedWord] }) => {
            // Strip quotes via regex, which were allowed in legacy syntax
            bannedWord = bannedWord.replace(/^"|"$/g, '');
            if (main_api === 'textgenerationwebui') {
                console.log('Found banned word in macros: ' + bannedWord);
                textgenerationwebui_banned_in_macros.push(bannedWord);
            }
            return '';
        },
    });

    // Outlet macro: {{outlet::key}}
    MacroRegistry.registerMacro('outlet', {
        requiredArgs: [
            {
                name: 'key',
                sampleValue: 'my-outlet-key',
                description: 'Outlet key.',
                type: 'string',
            },
        ],
        description: 'Returns the outlet prompt for a given outlet key.',
        handler: ({ requiredArgs: [outlet] }) => {
            if (!outlet) return '';
            const value = extension_prompts[inject_ids.CUSTOM_WI_OUTLET(outlet)]?.value;
            return value || '';
        },
    });
}

function getChatIdHash() {
    const cachedIdHash = chat_metadata['chat_id_hash'];
    if (typeof cachedIdHash === 'number') {
        return cachedIdHash;
    }

    const chatId = chat_metadata['main_chat'] ?? getCurrentChatId();
    const chatIdHash = getStringHash(chatId);
    chat_metadata['chat_id_hash'] = chatIdHash;
    return chatIdHash;
}
