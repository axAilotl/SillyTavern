import { MacroLexer } from './MacroLexer.js';
import { MacroParser } from './MacroParser.js';
import { MacroCstWalker } from './MacroCstWalker.js';
import { MacroRegistry } from './MacroRegistry.js';

class MacroEngine {
    static instance = new MacroEngine();

    constructor() {
        this.parser = MacroParser;
        this.cstWalker = MacroCstWalker;
        this.registry = MacroRegistry;
    }

    parseDocument(input) {
        if (!input) {
            return { cst: null, errors: [] };
        }

        const preProcessed = this.parser.preProcessFixLegacyMacros(input);
        const lexingResult = MacroLexer.tokenize(preProcessed);

        this.parser.input = lexingResult.tokens;
        const cst = this.parser.document();

        const errors = [
            ...lexingResult.errors,
            ...this.parser.errors,
        ];

        return { cst, errors };
    }

    async evaluate(input, env) {
        if (!input) {
            return '';
        }

        const preProcessed = this.parser.preProcessFixLegacyMacros(input);
        const lexingResult = MacroLexer.tokenize(preProcessed);

        if (lexingResult.errors && lexingResult.errors.length > 0) {
            // For now, we log and still try to process what we can.
            console.warn('Macro lexing errors detected:', lexingResult.errors);
        }

        this.parser.input = lexingResult.tokens;
        const cst = this.parser.document();

        if (this.parser.errors && this.parser.errors.length > 0) {
            console.warn('Macro parsing errors detected:', this.parser.errors);
        }

        const resolveMacro = async call => {
            const { name } = call;

            if (!name) {
                return call.rawWithBraces || '';
            }

            const hasMacro = typeof this.registry.hasMacro === 'function'
                ? this.registry.hasMacro(name)
                : false;

            if (!hasMacro) {
                // Unknown macro: keep macro syntax, but nested macros inside rawInner are already resolved.
                if (typeof call.rawInner === 'string') {
                    return `{{${call.rawInner}}}`;
                }
                return call.rawWithBraces || '';
            }

            if (typeof this.registry.executeMacro === 'function') {
                return this.registry.executeMacro(name, {
                    name,
                    args: call.args,
                    raw: call.rawInner,
                    env: call.env,
                    cstNode: call.cstNode,
                    range: call.range,
                });
            }

            return call.rawWithBraces || '';
        };

        return this.cstWalker.evaluateDocument({
            text: preProcessed,
            cst,
            env,
            resolveMacro,
        });
    }
}

const macroEngineInstance = MacroEngine.instance;

export { MacroEngine, macroEngineInstance };
