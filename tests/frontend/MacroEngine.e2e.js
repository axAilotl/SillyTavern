import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

test.describe('MacroEngine', () => {
    test.beforeEach(testSetup.awaitST);

    test.describe('Basic evaluation', () => {
        test('should return input unchanged when there are no macros', async ({ page }) => {
            const input = 'Hello world, no macros here.';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe(input);
        });

        test('should evaluate a simple macro without arguments', async ({ page }) => {
            const input = 'Start {{newline}} end.';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Start \n end.');
        });

        test('should evaluate multiple macros in order', async ({ page }) => {
            const input = 'A {{setvar::test::4}}{{getvar::test}} B {{setvar::test::2}}{{getvar::test}} C';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('A 4 B 2 C');
        });
    });

    test.describe('Unnamed arguments', () => {
        test('should handle normal double-colon separated unnamed argument', async ({ page }) => {
            const input = 'Reversed: {{reverse::abc}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Reversed: cba!');
        });

        test('should handle (legacy) colon separated unnamed argument', async ({ page }) => {
            const input = 'Reversed: {{reverse:abc}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Reversed: cba!');
        });

        test('should handle (legacy) colon separated argument as only one, even with more separators (double colon)', async ({ page }) => {
            const input = 'Reversed: {{reverse:abc::def}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Reversed: fed::cba!');
        });

        test('should handle (legacy) colon separated argument as only one, even with more separators (single colon)', async ({ page }) => {
            const input = 'Reversed: {{reverse:abc:def}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Reversed: fed:cba!');
        });

        test('should handle (legacy) whitespace separated unnamed argument', async ({ page }) => {
            const input = 'Values: {{roll 1d1}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Values: 1!');
        });

        test('should handle (legacy) whitespace separated unnamed argument as only one, even with more separators (space)', async ({ page }) => {
            const input = 'Values: {{reverse abc def}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Values: fed cba!');
        });

        test('should support multi-line arguments for macros', async ({ page }) => {
            const input = `Result: {{reverse::first line\nsecond line}}`; // "\n" becomes a real newline in the macro argument
            const output = await evaluateWithEngine(page, input);

            const original = 'first line\nsecond line';
            const expectedReversed = Array.from(original).reverse().join('');
            expect(output).toBe(`Result: ${expectedReversed}`);
        });
    });

    test.describe('Nested macros', () => {
        test('should resolve nested macros inside arguments inside-out', async ({ page }) => {
            const input = 'Result: {{setvar::test::0}}{{reverse::{{addvar::test::100}}{{getvar::test}}}}{{setvar::test::0}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Result: 001');
        });

        // {{wrap::{{upper::x}}::[::]}} -> '[X]'
        test('should resolve nested macros across multiple arguments', async ({ page }) => {
            const input = 'Result: {{setvar::addvname::test}}{{addvar::{{getvar::addvname}}::{{setvar::test::5}}{{getvar::test}}}}{{getvar::test}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Result: 10');
        });
    });

    test.describe('Unknown macros', () => {
        test('should keep unknown macro syntax but resolve nested macros inside it', async ({ page }) => {
            const input = 'Test: {{unknown::{{newline}}}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Test: {{unknown::\n}}');
        });

        test('should keep surrounding text inside unknown macros intact', async ({ page }) => {
            const input = 'Test: {{unknown::my {{newline}} example}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Test: {{unknown::my \n example}}');
        });
    });

    test.describe('Comment macro', () => {
        test('should remove single-line comments with simple body', async ({ page }) => {
            const input = 'Hello{{// comment}}World';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('HelloWorld');
        });

        test('should accept non-word characters immediately after //', async ({ page }) => {
            const input = 'A{{//!@#$%^&*()_+}}B';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('AB');
        });

        test('should ignore additional // sequences inside the comment body', async ({ page }) => {
            const input = 'X{{//comment with // extra // slashes}}Y';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('XY');
        });

        test('should support multi-line comment bodies', async ({ page }) => {
            const input = `Start{{// line one\nline two\nline three}}End`;
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('StartEnd');
        });
    });

    test.describe('Legacy compatibility', () => {
        test('should strip trim macro and surrounding newlines (legacy behavior)', async ({ page }) => {
            const input = 'foo\n\n{{trim}}\n\nbar';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('foobar');
        });

        test('should handle multiple trim macros in a single string', async ({ page }) => {
            const input = 'A\n\n{{trim}}\n\nB\n\n{{trim}}\n\nC';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('ABC');
        });

        test('should support legacy time macro with positive offset via pre-processing', async ({ page }) => {
            const input = 'Time: {{time_UTC+2}}';
            const output = await evaluateWithEngine(page, input);

            // After pre-processing, this should behave like {{time::UTC+2}} and be resolved by the time macro.
            // We only assert that the placeholder was consumed and some non-empty value was produced.
            expect(output).not.toBe(input);
            expect(output.startsWith('Time: ')).toBeTruthy();
            expect(output.length).toBeGreaterThan('Time: '.length);
        });

        test('should support legacy time macro with negative offset via pre-processing', async ({ page }) => {
            const input = 'Time: {{time_UTC-10}}';
            const output = await evaluateWithEngine(page, input);

            expect(output).not.toBe(input);
            expect(output.startsWith('Time: ')).toBeTruthy();
            expect(output.length).toBeGreaterThan('Time: '.length);
        });

        test('should support legacy <USER> marker via pre-processing', async ({ page }) => {
            const input = 'Hello <USER>!';
            const output = await evaluateWithEngine(page, input);

            // In the default test env, name1Override is "User".
            expect(output).toBe('Hello User!');
        });

        test('should support legacy <BOT> and <CHAR> markers via pre-processing', async ({ page }) => {
            const input = 'Bot: <BOT>, Char: <CHAR>.';
            const output = await evaluateWithEngine(page, input);

            // In the default test env, name2Override is "Character".
            expect(output).toBe('Bot: Character, Char: Character.');
        });

        test('should support legacy <GROUP> and <CHARIFNOTGROUP> markers via pre-processing (non-group fallback)', async ({ page }) => {
            const input = 'Group: <GROUP>, CharIfNotGroup: <CHARIFNOTGROUP>.';
            const output = await evaluateWithEngine(page, input);

            // Without an active group, both markers fall back to the current character name.
            expect(output).toBe('Group: Character, CharIfNotGroup: Character.');
        });
    });

    test.describe('Arity errors', () => {
        test('should not resolve newline when called with arguments', async ({ page }) => {
            /** @type {string[]} */
            const warnings = [];
            page.on('console', msg => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            });

            const input = 'Start {{newline::extra}} end.';
            const output = await evaluateWithEngine(page, input);

            // Macro text should remain unchanged
            expect(output).toBe(input);

            // Should have logged an arity warning for newline
            expect(warnings.some(w => w.includes('Macro "newline"') && w.includes('unnamed arguments'))).toBeTruthy();
        });

        test('should not resolve reverse when called without arguments', async ({ page }) => {
            /** @type {string[]} */
            const warnings = [];
            page.on('console', msg => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            });

            const input = 'Result: {{reverse}}';
            const output = await evaluateWithEngine(page, input);

            expect(output).toBe(input);

            expect(warnings.some(w => w.includes('Macro "reverse"') && w.includes('unnamed arguments'))).toBeTruthy();
        });

        test('should not resolve reverse when called with too many arguments', async ({ page }) => {
            /** @type {string[]} */
            const warnings = [];
            page.on('console', msg => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            });

            const input = 'Result: {{reverse::a::b}}';
            const output = await evaluateWithEngine(page, input);

            // Macro text should remain unchanged when extra unnamed args are provided
            expect(output).toBe(input);

            // Should have logged an arity warning for reverse
            expect(warnings.some(w => w.includes('Macro "reverse"') && w.includes('unnamed arguments'))).toBeTruthy();
        });

        test('should not resolve list-bounded macro when called outside list bounds', async ({ page }) => {
            /** @type {string[]} */
            const warnings = [];
            page.on('console', msg => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            });

            // Register a temporary macro with explicit list bounds: exactly 1 required + 1-2 list args
            await page.evaluate(async () => {
                /** @type {import('../../public/scripts/macros/engine/MacroRegistry.js')} */
                const { MacroRegistry } = await import('./scripts/macros/engine/MacroRegistry.js');

                MacroRegistry.unregisterMacro('test-list-bounds');
                MacroRegistry.registerMacro('test-list-bounds', {
                    requiredArgs: 1,
                    list: { min: 1, max: 2 },
                    description: 'Test macro for list bounds.',
                    handler: ({ requiredArgs, list }) => {
                        const all = [...requiredArgs, ...(list ?? [])];
                        return all.join('|');
                    },
                });
            });

            // First macro: too few list args (only required arg)
            // Second macro: too many list args (required arg + 3 list entries)
            const input = 'A {{test-list-bounds::base}} B {{test-list-bounds::base::x::y::z}}';
            const output = await evaluateWithEngine(page, input);

            // Both macros should remain unchanged in the output
            expect(output).toBe(input);

            const testWarnings = warnings.filter(w => w.includes('Macro "test-list-bounds"') && w.includes('unnamed arguments'));
            // We expect one warning for each invalid invocation (too few and too many list args)
            expect(testWarnings.length).toBe(2);
        });
    });

    test.describe('Type validation', () => {
        test('should not resolve strict typed macro when argument type is invalid', async ({ page }) => {
            /** @type {string[]} */
            const warnings = [];
            page.on('console', msg => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            });

            await page.evaluate(async () => {
                /** @type {import('../../public/scripts/macros/engine/MacroRegistry.js')} */
                const { MacroRegistry } = await import('./scripts/macros/engine/MacroRegistry.js');

                MacroRegistry.unregisterMacro('test-int-strict');
                MacroRegistry.registerMacro('test-int-strict', {
                    requiredArgs: [
                        { name: 'value', type: 'integer', description: 'Must be an integer.' },
                    ],
                    strictArgs: true,
                    description: 'Strict integer macro for testing type validation.',
                    handler: ({ requiredArgs: [value] }) => `#${value}#`,
                });
            });

            const input = 'Value: {{test-int-strict::abc}}';
            const output = await evaluateWithEngine(page, input);

            // Strict typed macro should leave the text unchanged when the argument is invalid
            expect(output).toBe(input);

            // A runtime type validation warning should be logged
            expect(warnings.some(w => w.includes('Macro "test-int-strict"') && w.includes('expected type integer'))).toBeTruthy();
        });

        test('should resolve non-strict typed macro when argument type is invalid but still log warning', async ({ page }) => {
            /** @type {string[]} */
            const warnings = [];
            page.on('console', msg => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            });

            await page.evaluate(async () => {
                /** @type {import('../../public/scripts/macros/engine/MacroRegistry.js')} */
                const { MacroRegistry } = await import('./scripts/macros/engine/MacroRegistry.js');

                MacroRegistry.unregisterMacro('test-int-nonstrict');
                MacroRegistry.registerMacro('test-int-nonstrict', {
                    requiredArgs: [
                        { name: 'value', type: 'integer', description: 'Must be an integer.' },
                    ],
                    strictArgs: false,
                    description: 'Non-strict integer macro for testing type validation.',
                    handler: ({ requiredArgs: [value] }) => `#${value}#`,
                });
            });

            const input = 'Value: {{test-int-nonstrict::abc}}';
            const output = await evaluateWithEngine(page, input);

            // Non-strict typed macro should still execute, even with invalid type
            expect(output).toBe('Value: #abc#');

            // A runtime type validation warning should still be logged
            expect(warnings.some(w => w.includes('Macro "test-int-nonstrict"') && w.includes('expected type integer'))).toBeTruthy();
        });
    });

    test.describe('Dynamic macros', () => {
        test('should not resolve dynamic macro when called with arguments due to strict arity', async ({ page }) => {
            /** @type {string[]} */
            const warnings = [];
            page.on('console', msg => {
                if (msg.type() === 'warning') {
                    warnings.push(msg.text());
                }
            });

            const input = 'Dyn: {{dyn::extra}}';
            const output = await page.evaluate(async (input) => {
                /** @type {import('../../public/scripts/macros/engine/MacroEngine.js')} */
                const { MacroEngine } = await import('./scripts/macros/engine/MacroEngine.js');
                /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
                const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

                /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js').MacroEnvRawContext} */
                const rawEnv = {
                    content: input,
                    dynamicMacros: {
                        dyn: () => 'OK',
                    },
                };
                const env = MacroEnvBuilder.buildFromRawEnv(rawEnv);

                return MacroEngine.evaluate(input, env);
            }, input);

            // Dynamic macro with arguments should not resolve because the
            // temporary definition is strictArgs: true and requiredArgs: 0.
            expect(output).toBe(input);

            // A runtime arity warning for the dynamic macro should be logged
            expect(warnings.some(w => w.includes('Macro "dyn"') && w.includes('unnamed arguments'))).toBeTruthy();
        });
    });
});

/**
 * Evaluates the given input string using the MacroEngine inside the browser
 * context, ensuring that the core macros are registered.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} input
 * @returns {Promise<string>}
 */
async function evaluateWithEngine(page, input) {
    const result = await page.evaluate(async (input) => {
        /** @type {import('../../public/scripts/macros/engine/MacroEngine.js')} */
        const { MacroEngine } = await import('./scripts/macros/engine/MacroEngine.js');
        /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js')} */
        const { MacroEnvBuilder } = await import('./scripts/macros/engine/MacroEnvBuilder.js');

        /** @type {import('../../public/scripts/macros/engine/MacroEnvBuilder.js').MacroEnvRawContext} */
        const rawEnv = {
            content: input,
            name1Override: 'User',
            name2Override: 'Character',
        };
        const env = MacroEnvBuilder.buildFromRawEnv(rawEnv);

        const output = await MacroEngine.evaluate(input, env);
        return output;
    }, input);

    return result;
}
