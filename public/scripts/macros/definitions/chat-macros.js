import { MacroRegistry } from '../engine/MacroRegistry.js';
import { chat, chat_metadata } from '../../../script.js';

/**
 * Registers macros that inspect the current chat log and swipe state
 * (message texts, indices, swipes, and context boundaries).
 */
export function registerChatMacros() {
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
