import { test, expect } from '@playwright/test';
import { testSetup } from './utils.js';

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
    await page.waitForFunction('document.getElementById("preloader") === null', { timeout: 0 });
    await page.waitForTimeout(1000);
    const result = await page.evaluate(async (input) => {
        /** @type {import('../../public/scripts/macros/MacroEngine.js')} */
        const { MacroEngine } = await import('./scripts/macros/MacroEngine.js');
        const output = await MacroEngine.evaluate(input, {});
        return output;
    }, input);

    return result;
}
