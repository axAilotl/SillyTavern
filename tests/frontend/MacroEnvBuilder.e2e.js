import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

// Frontend env-builder tests run in the browser context; allow some time
// for SillyTavern to boot and scripts to load.
test.setTimeout(10_000);

test.describe('MacroEnvBuilder', () => {
    test.beforeEach(testSetup.awaitST);

    test('builds names from overrides without relying on globals', async ({ page }) => {
        const result = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: 'ignored',
                name1Override: 'UserOverride',
                name2Override: 'CharOverride',
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return {
                user: env.names?.user,
                char: env.names?.char,
            };
        });

        expect(result).toEqual({
            user: 'UserOverride',
            char: 'CharOverride',
        });
    });

    test('falls back to global name1/name2 when overrides are not provided', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const script = await import('./script.js');
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: undefined,
                name2Override: undefined,
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return {
                globalUser: script.name1,
                globalChar: script.name2,
                envUser: env.names?.user,
                envChar: env.names?.char,
            };
        });

        expect(result.envUser).toBe(result.globalUser);
        expect(result.envChar).toBe(result.globalChar);
    });

    test('does not populate character fields when replaceCharacterCard is false', async ({ page }) => {
        const keys = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return Object.keys(env.character || {});
        });

        expect(keys).toEqual([]);
    });

    test('populates character fields when replaceCharacterCard is true', async ({ page }) => {
        const keys = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: undefined,
                name2Override: undefined,
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: true,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return Object.keys(env.character || {});
        });

        // We do not assert on concrete values, only that the known keys exist
        expect(keys).toEqual(expect.arrayContaining([
            'charPrompt',
            'charInstruction',
            'description',
            'personality',
            'scenario',
            'persona',
            'mesExamplesRaw',
            'version',
            'charDepthPrompt',
            'creatorNotes',
        ]));
    });

    test('wraps original string into a one-shot helper function', async ({ page }) => {
        const result = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: 'ORIGINAL_VALUE',
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            const hasFn = typeof env.extra?.original === 'function';
            const first = hasFn ? env.extra.original() : null;
            const second = hasFn ? env.extra.original() : null;

            return { hasFn, first, second };
        });

        expect(result).toEqual({
            hasFn: true,
            first: 'ORIGINAL_VALUE',
            second: '',
        });
    });

    test('does not expose original helper when original is not a string', async ({ page }) => {
        const hasFn = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return typeof env.extra?.original === 'function';
        });

        expect(hasFn).toBe(false);
    });

    test('uses groupOverride string for all group-related name fields', async ({ page }) => {
        const result = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: undefined,
                groupOverride: 'Group One, Group Two',
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return {
                group: env.names?.group,
                groupNotMuted: env.names?.groupNotMuted,
                notChar: env.names?.notChar,
            };
        });

        expect(result).toEqual({
            group: 'Group One, Group Two',
            groupNotMuted: 'Group One, Group Two',
            notChar: 'Group One, Group Two',
        });
    });

    test('uses solo-chat semantics when no group is selected', async ({ page }) => {
        const result = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');
            const groupChats = await import('./scripts/group-chats.js');

            // Ensure we are in a solo-chat like state for this test
            if (typeof groupChats.resetSelectedGroup === 'function') {
                groupChats.resetSelectedGroup();
            }

            const ctx = {
                content: '',
                name1Override: 'UserSolo',
                name2Override: 'CharSolo',
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return {
                group: env.names?.group,
                groupNotMuted: env.names?.groupNotMuted,
                notChar: env.names?.notChar,
            };
        });

        expect(result).toEqual({
            group: 'CharSolo',
            groupNotMuted: 'CharSolo',
            notChar: 'UserSolo',
        });
    });

    test('merges additionalMacro properties into env.extra', async ({ page }) => {
        const extra = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: {
                    simple: 'value',
                    number: 42,
                    nested: { foo: 'bar' },
                },
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return env.extra;
        });

        expect(extra.simple).toBe('value');
        expect(extra.number).toBe(42);
        expect(extra.nested).toEqual({ foo: 'bar' });
    });

    test('allows additionalMacro to override original helper when keys collide', async ({ page }) => {
        const result = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: 'ORIGINAL_VALUE',
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: {
                    original: 'OVERRIDE_VALUE',
                },
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return {
                type: typeof env.extra?.original,
                value: env.extra?.original,
            };
        });

        expect(result).toEqual({
            type: 'string',
            value: 'OVERRIDE_VALUE',
        });
    });

    test('sets system.model field from getGeneratingModel helper', async ({ page }) => {
        const model = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            const ctx = {
                content: '',
                name1Override: undefined,
                name2Override: undefined,
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return env.system?.model;
        });

        expect(typeof model === 'string' || model === undefined).toBe(true);
    });

    test('applies providers in the expected order buckets', async ({ page }) => {
        const order = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder, env_provider_order } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            MacroEnvBuilder.registerProvider((env) => {
                env.extra.order = [...(env.extra.order || []), 'EARLY'];
            }, env_provider_order.EARLY);

            MacroEnvBuilder.registerProvider((env) => {
                env.extra.order = [...(env.extra.order || []), 'LATE'];
            }, env_provider_order.LATE);

            MacroEnvBuilder.registerProvider((env) => {
                env.extra.order = [...(env.extra.order || []), 'NORMAL'];
            }, env_provider_order.NORMAL);

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: undefined,
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return env.extra.order;
        });

        // We only guarantee relative ordering between the buckets we added,
        // not that there are no other entries from other providers.
        const earlyIndex = order.indexOf('EARLY');
        const normalIndex = order.indexOf('NORMAL');
        const lateIndex = order.indexOf('LATE');

        expect(earlyIndex).toBeGreaterThanOrEqual(0);
        expect(normalIndex).toBeGreaterThan(earlyIndex);
        expect(lateIndex).toBeGreaterThan(normalIndex);
    });

    test('ignores provider errors without breaking env construction', async ({ page }) => {
        const result = await page.evaluate(async () => {
            /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
            const { MacroEnvBuilder, env_provider_order } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

            MacroEnvBuilder.registerProvider(() => {
                throw new Error('intentional test error');
            }, env_provider_order.NORMAL);

            const ctx = {
                content: '',
                name1Override: 'User',
                name2Override: 'Char',
                original: undefined,
                groupOverride: undefined,
                replaceCharacterCard: false,
                additionalMacro: { marker: 'value' },
            };

            const env = MacroEnvBuilder.buildFromRawEnv(ctx);
            return {
                namesUser: env.names?.user,
                hasMarker: env.extra?.marker === 'value',
            };
        });

        expect(result.hasMarker).toBe(true);
        expect(result.namesUser).toBe('User');
    });
});
