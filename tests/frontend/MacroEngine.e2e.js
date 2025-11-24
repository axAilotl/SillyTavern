import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

// Those tests are evaluating via Playwright; they need more time to run and finish
// For now, engine tests need a lot of setup, so we need a higher timeout
test.setTimeout(20_000);

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
