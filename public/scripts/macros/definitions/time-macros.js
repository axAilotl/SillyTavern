import { moment } from '../../../lib.js';
import { chat } from '../../../script.js';
import { timestampToMoment } from '../../utils.js';
import { MacroRegistry } from '../engine/MacroRegistry.js';

/**
 * Registers time/date related macros and utilities.
 */
export function registerTimeMacros() {
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
