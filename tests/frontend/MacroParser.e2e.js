import { test, expect } from '@playwright/test';

/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('chevrotain').IRecognitionException} IRecognitionException */

/** @typedef {{[tokenName: string]: (string|string[]|TestableCstNode|TestableCstNode[])}} TestableCstNode */
/** @typedef {{name: string, message: string}} TestableRecognitionException */

test.setTimeout(10_000);

test.describe('MacroParser', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction('document.getElementById("preloader") === null', { timeout: 0 });
    });

    test.describe('General Macro', () => {
        // {{user}}
        test('should parse a simple macro', async ({ page }) => {
            const input = '{{user}}';
            const macroCst = await runParser(page, input);

            const expectedCst = {
                'Macro.Start': '{{',
                'Macro.Identifier': 'user',
                'Macro.End': '}}',
            };

            expect(macroCst).toEqual(expectedCst);
        });
        // {{  user  }}
        test('should generally handle whitespaces', async ({ page }) => {
            const input = '{{  user  }}';
            const macroCst = await runParser(page, input);

            const expectedCst = {
                'Macro.Start': '{{',
                'Macro.Identifier': 'user',
                'Macro.End': '}}',
            };

            expect(macroCst).toEqual(expectedCst);
        });

        test.describe('Error Cases (General Macro)', () => {
            // {{}}
            test('[Error] should throw an error for empty macro', async ({ page }) => {
                const input = '{{}}';
                const { macroCst, errors } = await runParserAndGetErrors(page, input);

                const expectedErrors = [
                    { name: 'MismatchedTokenException', message: 'Expecting token of type --> Macro.Identifier <-- but found --> \'}}\' <--' },
                ];

                expect(macroCst).toBeUndefined();
                expect(errors).toEqual(expectedErrors);
            });
            // {{§!#&blah}}
            test('[Error] should throw an error for invalid identifier', async ({ page }) => {
                const input = '{{§!#&blah}}';
                const { macroCst, errors } = await runParserAndGetErrors(page, input);

                const expectedErrors = [
                    { name: 'MismatchedTokenException', message: 'Expecting token of type --> Macro.Identifier <-- but found --> \'!\' <--' },
                ];

                expect(macroCst).toBeUndefined();
                expect(errors).toEqual(expectedErrors);
            });
            // {{user
            test('[Error] should throw an error for incomplete macro', async ({ page }) => {
                const input = '{{user';
                const { macroCst, errors } = await runParserAndGetErrors(page, input);

                const expectedErrors = [
                    { name: 'MismatchedTokenException', message: 'Expecting token of type --> Macro.End <-- but found --> \'\' <--' },
                ];

                expect(macroCst).toBeUndefined();
                expect(errors).toEqual(expectedErrors);
            });

            // something{{user}}
            // something{{user}}
            test('[Error] for testing purposes, macros need to start at the beginning of the string', async ({ page }) => {
                const input = 'something{{user}}';
                const { macroCst, errors } = await runParserAndGetErrors(page, input);

                const expectedErrors = [
                    { name: 'MismatchedTokenException', message: 'Expecting token of type --> Macro.Start <-- but found --> \'something\' <--' },
                ];

                expect(macroCst).toBeUndefined();
                expect(errors).toEqual(expectedErrors);
            });
        });
    });

    test.describe('Arguments Handling', () => {
        // {{getvar::myvar}}
        test('should parse macros with double-colon argument', async ({ page }) => {
            const input = '{{getvar::myvar}}';
            const macroCst = await runParser(page, input, {
                flattenKeys: ['arguments.argument'],
            });
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'getvar',
                'arguments': {
                    'separator': '::',
                    'argument': 'myvar',
                },
                'Macro.End': '}}',
            });
        });

        // {{roll:3d20}}
        test('should parse macros with single colon argument', async ({ page }) => {
            const input = '{{roll:3d20}}';
            const macroCst = await runParser(page, input, {
                flattenKeys: ['arguments.argument'],
            });
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'roll',
                'arguments': {
                    'separator': ':',
                    'argument': '3d20',
                },
                'Macro.End': '}}',
            });
        });

        // {{setvar::myvar::value}}
        test('should parse macros with multiple double-colon arguments', async ({ page }) => {
            const input = '{{setvar::myvar::value}}';
            const macroCst = await runParser(page, input, {
                flattenKeys: ['arguments.argument'],
                ignoreKeys: ['arguments.Args.DoubleColon'],
            });
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'setvar',
                'arguments': {
                    'separator': '::',
                    'argument': ['myvar', 'value'],
                },
                'Macro.End': '}}',
            });
        });

        // {{something::  spaced  }}
        test('should strip spaces around arguments', async ({ page }) => {
            const input = '{{something::  spaced  }}';
            const macroCst = await runParser(page, input, {
                flattenKeys: ['arguments.argument'],
                ignoreKeys: ['arguments.separator', 'arguments.Args.DoubleColon'],
            });
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'something',
                'arguments': { 'argument': 'spaced' },
                'Macro.End': '}}',
            });
        });

        // {{something::with:single:colons}}
        test('should treat single colons as part of the argument with double-colon separator', async ({ page }) => {
            const input = '{{something::with:single:colons}}';
            const macroCst = await runParser(page, input, {
                flattenKeys: ['arguments.argument'],
                ignoreKeys: ['arguments.Args.DoubleColon'],
            });
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'something',
                'arguments': {
                    'separator': '::',
                    'argument': 'with:single:colons',
                },
                'Macro.End': '}}',
            });
        });

        // {{legacy:something:else}}
        test('should treat single colons as part of the argument even with colon separator', async ({ page }) => {
            const input = '{{legacy:something:else}}';
            const macroCst = await runParser(page, input, {
                flattenKeys: ['arguments.argument'],
                ignoreKeys: ['arguments.separator', 'arguments.Args.Colon'],
            });
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'legacy',
                'arguments': { 'argument': 'something:else' },
                'Macro.End': '}}',
            });
        });

        test.describe('Error Cases (Arguments Handling)', () => {
            // {{something::}}
            test('[Error] should throw an error for double-colon without a value', async ({ page }) => {
                const input = '{{something::}}';
                const { macroCst, errors } = await runParserAndGetErrors(page, input);

                const expectedErrors = [
                    {
                        name: 'EarlyExitException', message: expect.stringMatching(/^Expecting: expecting at least one iteration which starts with one of these possible Token sequences:/),
                    },
                ];

                expect(macroCst).toBeUndefined();
                expect(errors).toEqual(expectedErrors);
            });
        });

    });

    test.describe('Nested Macros', () => {
        test('should parse nested macros inside arguments', async ({ page }) => {
            const input = '{{outer::word {{inner}}}}';
            const macroCst = await runParser(page, input, {});
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'outer',
                'arguments': {
                    'argument': {
                        'Identifier': 'word',
                        'macro': {
                            'Macro.Start': '{{',
                            'Macro.Identifier': 'inner',
                            'Macro.End': '}}',
                        },
                    },
                    'separator': '::',
                },
                'Macro.End': '}}',
            });
        });

        test('should parse two nested macros next to each other inside an argument', async ({ page }) => {
            const input = '{{outer::word {{inner1}}{{inner2}}}}';
            const macroCst = await runParser(page, input, {});
            expect(macroCst).toEqual({
                'Macro.Start': '{{',
                'Macro.Identifier': 'outer',
                'arguments': {
                    'argument': {
                        'Identifier': 'word',
                        'macro': [
                            {
                                'Macro.Start': '{{',
                                'Macro.Identifier': 'inner1',
                                'Macro.End': '}}',
                            },
                            {
                                'Macro.Start': '{{',
                                'Macro.Identifier': 'inner2',
                                'Macro.End': '}}',
                            },
                        ],
                    },
                    'separator': '::',
                },
                'Macro.End': '}}',
            });
        });

        test.describe('Error Cases (Nested Macros)', () => {

            test('[Error] should throw when there is a nested macro instead of an identifier', async ({ page }) => {
                const input = '{{{{macroindentifier}}::value}}';
                const { macroCst, errors } = await runParserAndGetErrors(page, input);

                expect(macroCst).toBeUndefined();
                expect(errors).toHaveLength(1); // error doesn't really matter. Just don't parse it pls.
            });

            test('[Error] should throw when there is a macro inside an identifier', async ({ page }) => {
                const input = '{{inside{{macro}}me}}';
                const { macroCst, errors } = await runParserAndGetErrors(page, input);

                expect(macroCst).toBeUndefined();
                expect(errors).toHaveLength(1); // error doesn't really matter. Just don't parse it pls.
            });

        });
    });
});

/**
 * Runs the input through the MacroParser and returns the result.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page object.
 * @param {string} input - The input string to be parsed.
 * @param {Object} [options={}] Optional arguments
 * @param {string[]} [options.flattenKeys=[]] Optional array of dot-separated keys to flatten
 * @param {string[]} [options.ignoreKeys=[]] Optional array of dot-separated keys to ignore
 * @returns {Promise<TestableCstNode>} A promise that resolves to the result of the MacroParser.
 */
async function runParser(page, input, options = {}) {
    const { cst, errors } = await runParserAndGetErrors(page, input, options);

    // Make sure that parser errors get correctly marked as errors during testing, even if the resulting structure might work.
    // If we don't test for errors, the test should fail.
    if (errors.length > 0) {
        throw new Error('Parser errors found\n' + errors.map(x => x.message).join('\n'));
    }

    return cst;
}

/**
 * Runs the input through the MacroParser and returns the syntax tree result and any parser errors.
 *
 * Use `runParser` if you don't want to explicitly test against parser errors.
 *
 * @param {import('@playwright/test').Page} page - The Playwright page object.
 * @param {string} input - The input string to be parsed.
 * @param {Object} [options={}] Optional arguments
 * @param {string[]} [options.flattenKeys=[]] Optional array of dot-separated keys to flatten
 * @param {string[]} [options.ignoreKeys=[]] Optional array of dot-separated keys to ignore
 * @returns {Promise<{cst: TestableCstNode, errors: TestableRecognitionException[]}>} A promise that resolves to the result of the MacroParser and error list.
 */
async function runParserAndGetErrors(page, input, options = {}) {
    const result = await page.evaluate(async (input) => {
        /** @type {import('../../public/scripts/macros/MacroParser.js')} */
        const { MacroParser } = await import('./scripts/macros/MacroParser.js');

        const result = MacroParser.test(input);
        return result;
    }, input);

    return { cst: simplifyCstNode(result.cst, input, options), errors: simplifyErrors(result.errors) };
}

/**
 * Simplify the parser syntax tree result into an easily testable format.
 *
 * @param {CstNode} result The result from the parser
 * @param {Object} [options={}] Optional arguments
 * @param {string[]} [options.flattenKeys=[]] Optional array of dot-separated keys to flatten
 * @param {string[]} [options.ignoreKeys=[]] Optional array of dot-separated keys to ignore
 * @returns {TestableCstNode} The testable syntax tree
 */
function simplifyCstNode(cst, input, { flattenKeys = [], ignoreKeys = [] } = {}) {
    /** @returns {TestableCstNode} @param {CstNode} node @param {string[]} path */
    function simplifyNode(node, path = []) {
        if (!node) return node;
        if (Array.isArray(node)) {
            // Single-element arrays are converted to a single string
            if (node.length === 1) {
                return node[0].image || simplifyNode(node[0], path.concat('[]'));
            }
            // For multiple elements, return an array of simplified nodes
            return node.map(child => simplifyNode(child, path.concat('[]')));
        }
        if (node.children) {
            const simplifiedChildren = {};
            for (const key in node.children) {
                function simplifyChildNode(childNode, path) {
                    if (Array.isArray(childNode)) {
                        // Single-element arrays are converted to a single string
                        if (childNode.length === 1) {
                            return simplifyChildNode(childNode[0], path.concat('[]'));
                        }
                        return childNode.map(child => simplifyChildNode(child, path.concat('[]')));
                    }

                    const flattenKey = path.filter(x => x !== '[]').join('.');
                    if (ignoreKeys.includes(flattenKey)) {
                        return null;
                    } else if (flattenKeys.includes(flattenKey)) {
                        const startOffset = childNode.location.startOffset;
                        const endOffset = childNode.location.endOffset;
                        return input.slice(startOffset, endOffset + 1);
                    } else {
                        return simplifyNode(childNode, path);
                    }
                }

                const simplifiedValue = simplifyChildNode(node.children[key], path.concat(key));
                simplifiedValue && (simplifiedChildren[key] = simplifiedValue);
            }
            return simplifiedChildren;
        }
        return node.image;
    }

    return simplifyNode(cst);
}


/**
 * Simplifies a recognition exceptions into an easily testable format.
 *
 * @param {IRecognitionException[]} errors - The error list containing exceptions to be simplified.
 * @return {TestableRecognitionException[]} - The simplified error list
 */
function simplifyErrors(errors) {
    return errors.map(exception => ({
        name: exception.name,
        message: exception.message,
    }));
}
