import { MacroRegistry } from './MacroRegistry.js';
import { power_user } from '../power-user.js';

/**
 * Registers instruct-mode related {{...}} macros (instruct* and system
 * prompt/context macros) in the MacroRegistry.
 */
function registerInstructMacros() {
    // Helper to register macros that just expose a value from power_user.instruct
    /**
     * @param {string[]} names
     * @param {() => string} getValue
     * @param {() => boolean} isEnabled
     * @param {string} description
     */
    function registerSimple(names, getValue, isEnabled, description) {
        for (const name of names) {
            MacroRegistry.registerMacro(name, {
                description,
                handler: () => (isEnabled() ? (getValue() ?? '') : ''),
            });
        }
    }

    const enabled = () => !!power_user.instruct.enabled;

    // Instruct template macros
    registerSimple(['instructStoryStringPrefix'], () => power_user.instruct.story_string_prefix, enabled, 'Instruct story string prefix.');
    registerSimple(['instructStoryStringSuffix'], () => power_user.instruct.story_string_suffix, enabled, 'Instruct story string suffix.');

    registerSimple(['instructInput', 'instructUserPrefix'], () => power_user.instruct.input_sequence, enabled, 'Instruct input / user prefix sequence.');
    registerSimple(['instructUserSuffix'], () => power_user.instruct.input_suffix, enabled, 'Instruct input / user suffix sequence.');

    registerSimple(['instructOutput', 'instructAssistantPrefix'], () => power_user.instruct.output_sequence, enabled, 'Instruct output / assistant prefix sequence.');
    registerSimple(['instructSeparator', 'instructAssistantSuffix'], () => power_user.instruct.output_suffix, enabled, 'Instruct output / assistant suffix sequence.');

    registerSimple(['instructSystemPrefix'], () => power_user.instruct.system_sequence, enabled, 'Instruct system prefix sequence.');
    registerSimple(['instructSystemSuffix'], () => power_user.instruct.system_suffix, enabled, 'Instruct system suffix sequence.');

    registerSimple(['instructFirstOutput', 'instructFirstAssistantPrefix'], () => power_user.instruct.first_output_sequence || power_user.instruct.output_sequence, enabled, 'Instruct first assistant output prefix sequence.');
    registerSimple(['instructLastOutput', 'instructLastAssistantPrefix'], () => power_user.instruct.last_output_sequence || power_user.instruct.output_sequence, enabled, 'Instruct last assistant output prefix sequence.');

    registerSimple(['instructStop'], () => power_user.instruct.stop_sequence, enabled, 'Instruct stop sequence.');
    registerSimple(['instructUserFiller'], () => power_user.instruct.user_alignment_message, enabled, 'Instruct user alignment filler.');
    registerSimple(['instructSystemInstructionPrefix'], () => power_user.instruct.last_system_sequence, enabled, 'Instruct system instruction prefix sequence.');

    registerSimple(['instructFirstInput', 'instructFirstUserPrefix'], () => power_user.instruct.first_input_sequence || power_user.instruct.input_sequence, enabled, 'Instruct first user input prefix sequence.');
    registerSimple(['instructLastInput', 'instructLastUserPrefix'], () => power_user.instruct.last_input_sequence || power_user.instruct.input_sequence, enabled, 'Instruct last user input prefix sequence.');

    // System prompt macros
    MacroRegistry.registerMacro('systemPrompt', {
        description: 'Active system prompt text (optionally overridden by character prompt).',
        handler: ({ env }) => {
            const isEnabled = !!power_user.sysprompt.enabled;
            if (!isEnabled) {
                return '';
            }

            const charPrompt = env?.charPrompt ?? env?.character?.charPrompt ?? '';
            if (power_user.prefer_character_prompt && charPrompt) {
                return charPrompt;
            }

            return power_user.sysprompt.content ?? '';
        },
    });

    MacroRegistry.registerMacro('defaultSystemPrompt', {
        description: 'Default system prompt content.',
        handler: () => (power_user.sysprompt.enabled ? (power_user.sysprompt.content ?? '') : ''),
    });

    MacroRegistry.registerMacro('instructSystem', {
        description: 'Alias for the default system prompt.',
        handler: () => (power_user.sysprompt.enabled ? (power_user.sysprompt.content ?? '') : ''),
    });

    MacroRegistry.registerMacro('instructSystemPrompt', {
        description: 'Alias for the default system prompt.',
        handler: () => (power_user.sysprompt.enabled ? (power_user.sysprompt.content ?? '') : ''),
    });

    // Context template macros
    MacroRegistry.registerMacro('chatSeparator', {
        description: 'Separator used between example chat blocks in instruct mode.',
        handler: () => power_user.context.example_separator ?? '',
    });

    MacroRegistry.registerMacro('chatStart', {
        description: 'Chat start marker used in instruct mode.',
        handler: () => power_user.context.chat_start ?? '',
    });
}

export { registerInstructMacros };
