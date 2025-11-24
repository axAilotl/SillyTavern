import { MacroRegistry } from '../engine/MacroRegistry.js';
import { power_user } from '../../power-user.js';

/**
 * Registers instruct-mode related {{...}} macros (instruct* and system
 * prompt/context macros) in the MacroRegistry.
 */
export function registerInstructMacros() {
    /**
     * Helper to register macros that just expose a value from power_user.instruct
     * @typedef {{names: string[], getValue: () => string, isEnabled: () => boolean, description: string}}
     */
    function registerSimple(names, getValue, isEnabled, description) {
        for (const name of names) {
            MacroRegistry.registerMacro(name, {
                description,
                handler: () => (isEnabled() ? (getValue() ?? '') : ''),
            });
        }
    }

    const instEnabled = () => !!power_user.instruct.enabled;
    const sysEnabled = () => !!power_user.sysprompt.enabled;

    // Instruct template macros
    registerSimple(['instructStoryStringPrefix'], () => power_user.instruct.story_string_prefix, instEnabled, 'Instruct story string prefix.');
    registerSimple(['instructStoryStringSuffix'], () => power_user.instruct.story_string_suffix, instEnabled, 'Instruct story string suffix.');

    registerSimple(['instructInput', 'instructUserPrefix'], () => power_user.instruct.input_sequence, instEnabled, 'Instruct input / user prefix sequence.');
    registerSimple(['instructUserSuffix'], () => power_user.instruct.input_suffix, instEnabled, 'Instruct input / user suffix sequence.');

    registerSimple(['instructOutput', 'instructAssistantPrefix'], () => power_user.instruct.output_sequence, instEnabled, 'Instruct output / assistant prefix sequence.');
    registerSimple(['instructSeparator', 'instructAssistantSuffix'], () => power_user.instruct.output_suffix, instEnabled, 'Instruct output / assistant suffix sequence.');

    registerSimple(['instructSystemPrefix'], () => power_user.instruct.system_sequence, instEnabled, 'Instruct system prefix sequence.');
    registerSimple(['instructSystemSuffix'], () => power_user.instruct.system_suffix, instEnabled, 'Instruct system suffix sequence.');

    registerSimple(['instructFirstOutput', 'instructFirstAssistantPrefix'], () => power_user.instruct.first_output_sequence || power_user.instruct.output_sequence, instEnabled, 'Instruct first assistant output prefix sequence.');
    registerSimple(['instructLastOutput', 'instructLastAssistantPrefix'], () => power_user.instruct.last_output_sequence || power_user.instruct.output_sequence, instEnabled, 'Instruct last assistant output prefix sequence.');

    registerSimple(['instructStop'], () => power_user.instruct.stop_sequence, instEnabled, 'Instruct stop sequence.');
    registerSimple(['instructUserFiller'], () => power_user.instruct.user_alignment_message, instEnabled, 'Instruct user alignment filler.');
    registerSimple(['instructSystemInstructionPrefix'], () => power_user.instruct.last_system_sequence, instEnabled, 'Instruct system instruction prefix sequence.');

    registerSimple(['instructFirstInput', 'instructFirstUserPrefix'], () => power_user.instruct.first_input_sequence || power_user.instruct.input_sequence, instEnabled, 'Instruct first user input prefix sequence.');
    registerSimple(['instructLastInput', 'instructLastUserPrefix'], () => power_user.instruct.last_input_sequence || power_user.instruct.input_sequence, instEnabled, 'Instruct last user input prefix sequence.');

    // System prompt macros
    registerSimple(['defaultSystemPrompt', 'instructSystem', 'instructSystemPrompt'], () => power_user.sysprompt.content, sysEnabled, 'Alias for the default system prompt.');

    MacroRegistry.registerMacro('systemPrompt', {
        description: 'Active system prompt text (optionally overridden by character prompt).',
        handler: ({ env }) => {
            const isEnabled = !!power_user.sysprompt.enabled;
            if (!isEnabled) return '';

            if (power_user.prefer_character_prompt && env.character.charPrompt) {
                return env.character.charPrompt;
            }
            return power_user.sysprompt.content ?? '';
        },
    });

    // Context template macros
    registerSimple(['chatSeparator', 'exampleSeparator'], () => power_user.context.example_separator, () => true, 'Separator used between example chat blocks in instruct mode.');
    registerSimple(['chatStart'], () => power_user.context.chat_start, () => true, 'Chat start marker used in instruct mode.');
}
