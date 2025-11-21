import { moment, seedrandom, droll } from '../../lib.js';
import { chat, chat_metadata, main_api, getMaxContextSize, extension_prompts } from '../../script.js';
import { timestampToMoment } from '../utils.js';
import { textgenerationwebui_banned_in_macros } from '../textgen-settings.js';
import { inject_ids } from '../constants.js';
import { MacroRegistry } from './MacroRegistry.js';
import { registerVariableMacros } from './variable-macros.js';
import { registerInstructMacros } from './instruct-macros.js';

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

    // {{input}} -> current textarea content
    MacroRegistry.registerMacro('input', {
        description: 'Current text from the send textarea.',
        handler: () => (/** @type {HTMLTextAreaElement} */(document.querySelector('#send_textarea'))).value,
    });

    // {{maxPrompt}} -> max context size
    MacroRegistry.registerMacro('maxPrompt', {
        description: 'Maximum prompt context size.',
        handler: () => String(getMaxContextSize()),
    });

    // Chat inspection macros
    MacroRegistry.registerMacro('lastMessage', {
        description: 'Last message in the chat.',
        handler: () => String(getLastMessageCore() ?? ''),
    });
    MacroRegistry.registerMacro('lastMessageId', {
        description: 'Index of the last message in the chat.',
        handler: () => String(getLastMessageIdCore() ?? ''),
    });
    MacroRegistry.registerMacro('lastUserMessage', {
        description: 'Last user message in the chat.',
        handler: () => String(getLastUserMessageCore() ?? ''),
    });
    MacroRegistry.registerMacro('lastCharMessage', {
        description: 'Last character/bot message in the chat.',
        handler: () => String(getLastCharMessageCore() ?? ''),
    });
    MacroRegistry.registerMacro('firstIncludedMessageId', {
        description: 'Index of the first message included in the current context.',
        handler: () => String(getFirstIncludedMessageIdCore() ?? ''),
    });
    MacroRegistry.registerMacro('firstDisplayedMessageId', {
        description: 'Index of the first displayed message in the chat.',
        handler: () => String(getFirstDisplayedMessageIdCore() ?? ''),
    });
    MacroRegistry.registerMacro('lastSwipeId', {
        description: '1-based index of the last swipe for the last message.',
        handler: () => String(getLastSwipeIdCore() ?? ''),
    });
    MacroRegistry.registerMacro('currentSwipeId', {
        description: '1-based index of the current swipe.',
        handler: () => String(getCurrentSwipeIdCore() ?? ''),
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
    MacroRegistry.registerMacro('time', {
        // Optional single list argument: UTC offset, e.g. {{time::UTC+2}}
        list: { min: 0, max: 1 },
        description: 'Current local time, or UTC offset when called as {{time::UTC+1}} or {{time::UTC-7}}, etc.',
        handler: ({ list }) => {
            const offsetSpec = Array.isArray(list) && list.length > 0 ? String(list[0]).trim() : '';
            if (!offsetSpec) return moment().format('LT');

            const match = /^UTC([+-]\d+)$/.exec(offsetSpec);
            if (!match) return moment().format('LT');

            const offset = Number.parseInt(match[1], 10);
            if (Number.isNaN(offset)) return moment().format('LT');

            return moment().utc().utcOffset(offset).format('LT');
        },
    });

    MacroRegistry.registerMacro('date', {
        description: 'Current local date.',
        handler: () => moment().format('LL'),
    });

    MacroRegistry.registerMacro('weekday', {
        description: 'Current weekday name.',
        handler: () => moment().format('dddd'),
    });

    MacroRegistry.registerMacro('isotime', {
        description: 'Current time in HH:mm format.',
        handler: () => moment().format('HH:mm'),
    });

    MacroRegistry.registerMacro('isodate', {
        description: 'Current date in YYYY-MM-DD format.',
        handler: () => moment().format('YYYY-MM-DD'),
    });

    MacroRegistry.registerMacro('datetimeformat', {
        requiredArgs: 1,
        description: 'Formats the current date/time using the given moment.js format string.',
        handler: ({ requiredArgs: [format] }) => moment().format(format),
    });

    MacroRegistry.registerMacro('idle_duration', {
        description: 'Human-readable duration since the last user message.',
        handler: () => getTimeSinceLastMessageCore(),
    });

    // Time difference between two values
    MacroRegistry.registerMacro('timeDiff', {
        requiredArgs: 2,
        description: 'Human-readable difference between two times.',
        handler: ({ requiredArgs: [left, right] }) => {
            const diff = moment.duration(moment(left).diff(moment(right)));
            return diff.humanize(true);
        },
    });

    // Dice roll macro: {{roll 1d6}} or {{roll: 1d6}}
    MacroRegistry.registerMacro('roll', {
        requiredArgs: 1,
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

    // Banned words macro: {{banned "word"}}
    MacroRegistry.registerMacro('banned', {
        requiredArgs: 1,
        description: 'Bans a word for textgenerationwebui backend.',
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
        requiredArgs: 1,
        description: 'Returns the outlet prompt for a given outlet key.',
        handler: ({ requiredArgs: [outlet] }) => {
            if (!outlet) return '';
            const value = extension_prompts[inject_ids.CUSTOM_WI_OUTLET(outlet)]?.value;
            return value || '';
        },
    });

    // Variable macros (setvar/getvar/etc.)
    registerVariableMacros();

    // Instruct macros (instruct*, systemPrompt, chatSeparator/chatStart)
    registerInstructMacros();
}

function getLastMessageIdCore({ exclude_swipe_in_propress = true, filter = null } = {}) {
    if (!Array.isArray(chat) || chat.length === 0) {
        return null;
    }

    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];

        if (exclude_swipe_in_propress && message.swipes && message.swipe_id >= message.swipes.length) {
            continue;
        }

        if (!filter || filter(message)) {
            return i;
        }
    }

    return null;
}

function getLastMessageCore() {
    const mid = getLastMessageIdCore();
    return typeof mid === 'number' ? (chat[mid]?.mes ?? '') : '';
}

function getLastUserMessageCore() {
    const mid = getLastMessageIdCore({ filter: m => m.is_user && !m.is_system });
    return typeof mid === 'number' ? (chat[mid]?.mes ?? '') : '';
}

function getLastCharMessageCore() {
    const mid = getLastMessageIdCore({ filter: m => !m.is_user && !m.is_system });
    return typeof mid === 'number' ? (chat[mid]?.mes ?? '') : '';
}

function getFirstIncludedMessageIdCore() {
    const value = chat_metadata['lastInContextMessageId'];
    return typeof value === 'number' ? value : null;
}

function getFirstDisplayedMessageIdCore() {
    const mesElement = document.querySelector('#chat .mes');
    const mesId = Number(mesElement?.getAttribute('mesid'));
    if (!Number.isNaN(mesId) && mesId >= 0) {
        return mesId;
    }
    return null;
}

function getLastSwipeIdCore() {
    const mid = getLastMessageIdCore({ exclude_swipe_in_propress: false });
    if (typeof mid !== 'number') {
        return null;
    }
    const swipes = chat[mid]?.swipes;
    return Array.isArray(swipes) ? swipes.length : null;
}

function getCurrentSwipeIdCore() {
    const mid = getLastMessageIdCore({ exclude_swipe_in_propress: false });
    if (typeof mid !== 'number') {
        return null;
    }
    const swipeId = chat[mid]?.swipe_id;
    return typeof swipeId === 'number' ? swipeId + 1 : null;
}

function getTimeSinceLastMessageCore() {
    const now = moment();

    if (Array.isArray(chat) && chat.length > 0) {
        let lastMessage;
        let takeNext = false;

        for (let i = chat.length - 1; i >= 0; i--) {
            const message = chat[i];

            if (message.is_system) {
                continue;
            }

            if (message.is_user && takeNext) {
                lastMessage = message;
                break;
            }

            takeNext = true;
        }

        if (lastMessage?.send_date) {
            const lastMessageDate = timestampToMoment(lastMessage.send_date);
            const duration = moment.duration(now.diff(lastMessageDate));
            return duration.humanize();
        }
    }

    return 'just now';
}
