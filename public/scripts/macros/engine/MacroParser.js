import { chevrotain } from '../../../lib.js';
import { MacroLexer } from './MacroLexer.js';

const { CstParser } = chevrotain;

/** @typedef {import('chevrotain').TokenType} TokenType */
/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('chevrotain').ILexingError} ILexingError */
/** @typedef {import('chevrotain').IRecognitionException} IRecognitionException */

/**
 * The singleton instance of the MacroParser.
 *
 * @type {MacroParser}
 */
let instance;
export { instance as MacroParser };

class MacroParser extends CstParser {
    /** @type {MacroParser} */ static #instance;
    /** @type {MacroParser} */ static get instance() { return MacroParser.#instance ?? (MacroParser.#instance = new MacroParser()); }

    /** @private */
    constructor() {
        super(MacroLexer.def, {
            traceInitPerf: true,
            nodeLocationTracking: 'full',
        });
        const Tokens = MacroLexer.tokens;

        const $ = this;

        // Top-level document rule that can handle both plaintext and macros
        $.document = $.RULE('document', () => {
            $.MANY(() => {
                $.OR([
                    { ALT: () => $.CONSUME(Tokens.Plaintext) },
                    { ALT: () => $.SUBRULE($.macro) },
                ]);
            });
        });

        // Basic Macro Structure
        $.macro = $.RULE('macro', () => {
            $.CONSUME(Tokens.Macro.Start);
            $.OR([
                { ALT: () => $.CONSUME(Tokens.Macro.DoubleSlash, { LABEL: 'Macro.identifier' }) },
                { ALT: () => $.CONSUME(Tokens.Macro.Identifier, { LABEL: 'Macro.identifier' }) },
            ]);
            $.OPTION(() => $.SUBRULE($.arguments));
            $.CONSUME(Tokens.Macro.End);
        });

        // Arguments Parsing
        $.arguments = $.RULE('arguments', () => {
            $.OR([
                {
                    ALT: () => {
                        $.CONSUME(Tokens.Args.DoubleColon, { LABEL: 'separator' });
                        $.AT_LEAST_ONE_SEP({
                            SEP: Tokens.Args.DoubleColon,
                            DEF: () => $.SUBRULE($.argument, { LABEL: 'argument' }),
                        });
                    },
                },
                {
                    ALT: () => {
                        $.OPTION(() => {
                            $.CONSUME(Tokens.Args.Colon, { LABEL: 'separator' });
                        });
                        $.SUBRULE($.argumentAllowingColons, { LABEL: 'argument' });
                    },
                    // So, this is a bit hacky. But implemented below, the argument capture does explicitly exclude double colons
                    // from being captured as the first token. The potential ambiguity chevrotain claims here is not possible.
                    // It says stuff like <Args.DoubleColon, Identifier/Macro/Unknown> is possible in both branches, but it is not.
                    IGNORE_AMBIGUITIES: true,
                },
            ]);
        });

        // List the argument tokens here, as we need two rules, one to be able to parse with double colons and one without
        const validArgumentTokens = [
            { ALT: () => $.SUBRULE($.macro) }, // Nested Macros
            { ALT: () => $.CONSUME(Tokens.Identifier) },
            { ALT: () => $.CONSUME(Tokens.Unknown) },
            { ALT: () => $.CONSUME(Tokens.Args.Colon) },
            { ALT: () => $.CONSUME(Tokens.Args.Equals) },
            { ALT: () => $.CONSUME(Tokens.Args.Quote) },
        ];

        $.argument = $.RULE('argument', () => {
            $.MANY(() => {
                $.OR([...validArgumentTokens]);
            });
        });
        $.argumentAllowingColons = $.RULE('argumentAllowingColons', () => {
            $.AT_LEAST_ONE(() => {
                $.OR([
                    ...validArgumentTokens,
                    { ALT: () => $.CONSUME(Tokens.Args.DoubleColon) },
                ]);
            });
        });

        this.performSelfAnalysis();
    }

    /**
     * Parses a document into a CST.
     *
     * @param {string} input
     * @returns {{ cst: CstNode?, errors: ({ message: string }|ILexingError|IRecognitionException)[] }}
     */
    parseDocument(input) {
        if (!input) {
            return { cst: null, errors: [{ message: 'Input is empty' }] };
        }

        const preProcessed = this.preProcessFixLegacyMacros(input);
        const lexingResult = MacroLexer.tokenize(preProcessed);

        this.input = lexingResult.tokens;
        const cst = this.document();

        const errors = [
            ...lexingResult.errors,
            ...this.errors,
        ];

        return { cst, errors };
    }

    test(input) {
        const lexingResult = MacroLexer.tokenize(input);
        // "input" is a setter which will reset the parser's state.
        this.input = lexingResult.tokens;
        const cst = this.macro();

        // For testing purposes we need to actually persist the error messages in the object,
        // otherwise the test cases cannot read those, as they don't have access to the exception object type.
        const errors = this.errors.map(x => ({ message: x.message, ...x, stack: x.stack }));

        return { cst, errors: errors };
    }

    /**
     * Replaces legacy macros with the new macro format.
     * @param {string} content - The string to replace legacy macros in.
     * @returns {string} The string with legacy macros replaced.
     */
    preProcessFixLegacyMacros(content) {

        // This legacy macro will not be supported by the new macro parser, but rather regex-replaced beforehand
        // {{time_UTC-10}}   =>   {{time::UTC-10}}
        content = content.replace(/{{time_(UTC[+-]\d+)}}/gi, (match, offset) => {
            return `{{time::${offset}}}`;
        });

        return content;
    }
}

instance = MacroParser.instance;
