import { test, expect } from '@playwright/test';

// Those tests are evaluating via Playwright; they need more time to run and finish
test.setTimeout(10_000);

test.describe('MacroEngine', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction('document.getElementById("preloader") === null', { timeout: 0 });
    });

    test.describe('Basic evaluation', () => {
        // Plain text without macros should be returned unchanged
        test('should return input unchanged when there are no macros', async ({ page }) => {
            const input = 'Hello world, no macros here.';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe(input);
        });

        // {{ping}} -> 'pong'
        test('should evaluate a simple macro without arguments', async ({ page }) => {
            const input = 'Start {{ping}} end.';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Start pong end.');
        });

        // Multiple macros in a single string
        test('should evaluate multiple macros in order', async ({ page }) => {
            const input = 'A {{ping}} B {{ping}} C';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('A pong B pong C');
        });
    });

    test.describe('Unnamed arguments', () => {
        // {{echo::one::two}} -> 'one two'
        test('should handle double-colon separated unnamed arguments', async ({ page }) => {
            const input = 'Values: {{echo::one::two}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Values: one two!');
        });

        // {{echo: one two}} -> 'one two'
        test('should handle colon separated unnamed arguments', async ({ page }) => {
            const input = 'Values: {{echo: one two}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Values: one two!');
        });

        // {{echo one two}} -> 'one two'
        test('should handle whitespace separated unnamed arguments', async ({ page }) => {
            const input = 'Values: {{echo one two}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Values: one two!');
        });

        // {{first::a::b::c}} -> 'a'
        test('should pass multiple arguments and allow macros to access the first one', async ({ page }) => {
            const input = 'First: {{first::a::b::c}}.';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('First: a.');
        });
    });

    test.describe('Transforming arguments', () => {
        // {{upper::hello world}} -> 'HELLO WORLD'
        test('should transform argument content', async ({ page }) => {
            const input = 'Shout: {{upper::hello world}}!';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Shout: HELLO WORLD!');
        });

        // {{upper: this is upper content}} -> 'THIS IS UPPER CONTENT'
        test('should handle whitespace separated argument', async ({ page }) => {
            const input = 'Wrapped: {{upper this is upper content}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Wrapped: THIS IS UPPER CONTENT');
        });

        // {{wrap::value::[::]}} -> '[value]'
        test('should handle macros with multiple unnamed arguments', async ({ page }) => {
            const input = 'Wrapped: {{wrap::value::[::]}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Wrapped: [value]');
        });
    });

    test.describe('Nested macros', () => {
        // {{upper: hey {{ping}}}} -> 'HEY PONG'
        test('should resolve nested macros inside arguments inside-out', async ({ page }) => {
            const input = 'Result: {{upper: hey {{ping}}}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Result: HEY PONG');
        });

        // {{echo::before {{ping}} after}} -> 'before pong after'
        test('should resolve nested macros inside double-colon arguments', async ({ page }) => {
            const input = 'Result: {{echo::before {{ping}} after}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Result: before pong after');
        });

        // {{wrap::{{upper::x}}::[::]}} -> '[X]'
        test('should resolve nested macros across multiple arguments', async ({ page }) => {
            const input = 'Wrapped: {{wrap::{{upper::x}}::[::]}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Wrapped: [X]');
        });
    });

    test.describe('Unknown macros', () => {
        // {{unknown::{{ping}}}} -> '{{unknown::pong}}'
        test('should keep unknown macro syntax but resolve nested macros inside it', async ({ page }) => {
            const input = 'Test: {{unknown::{{ping}}}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Test: {{unknown::pong}}');
        });

        // {{unknown::my {{ping}} example}} -> '{{unknown::my pong example}}'
        test('should keep surrounding text inside unknown macros intact', async ({ page }) => {
            const input = 'Test: {{unknown::my {{ping}} example}}';
            const output = await evaluateWithEngine(page, input);
            expect(output).toBe('Test: {{unknown::my pong example}}');
        });
    });
});

/**
 * Evaluates the given input string using the MacroEngine inside the browser
 * context, ensuring that the prototype macros are registered.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} input
 * @returns {Promise<string>}
 */
async function evaluateWithEngine(page, input) {
    const result = await page.evaluate(async (input) => {
        /** @type {import('../../public/scripts/macros/MacroEngine.js')} */
        const { MacroEngine } = await import('./scripts/macros/MacroEngine.js');
        /** @type {import('../../public/scripts/macros/MacroBuiltins.js')} */
        const { registerPrototypeMacros } = await import('./scripts/macros/MacroBuiltins.js');
        /** @type {import('../../public/scripts/macros/MacroRegistry.js')} */
        const { MacroRegistry } = await import('./scripts/macros/MacroRegistry.js');

        // Ensure prototype macros are registered exactly once per page
        if (typeof MacroRegistry.hasMacro === 'function' && !MacroRegistry.hasMacro('ping')) {
            registerPrototypeMacros();
        }

        const output = await MacroEngine.evaluate(input, {});
        return output;
    }, input);

    return result;
}
