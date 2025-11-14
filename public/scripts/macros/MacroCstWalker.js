/**
 * @typedef {import('chevrotain').ICstNode} CstNode
 * @typedef {import('chevrotain').IToken} CstToken
 */

/**
 * @typedef {Object} MacroCall
 * @property {string} name
 * @property {string[]} args
 * @property {string} [rawInner]
 * @property {string} [rawWithBraces]
 * @property {{ startOffset: number, endOffset: number }} [range]
 * @property {CstNode} [cstNode]
 * @property {any} [env]
 */

/**
 * @typedef {Object} EvaluationContext
 * @property {string} text
 * @property {any} [env]
 * @property {(call: MacroCall) => (string|Promise<string>)} resolveMacro
 */

/**
 * The singleton instance of the MacroCstWalker.
 *
 * @type {MacroCstWalker}
 */
let instance;
export { instance as MacroCstWalker };

class MacroCstWalker {
    /** @type {MacroCstWalker} */
    static #instance;

    /** @type {MacroCstWalker} */
    static get instance() {
        return MacroCstWalker.#instance ?? (MacroCstWalker.#instance = new MacroCstWalker());
    }

    /** @type {WeakMap<CstNode, string>} */
    #macroCache;

    constructor() {
        this.#macroCache = new WeakMap();
    }

    /**
     * Evaluates a full document CST into a resolved string.
     *
     * @param {EvaluationContext & { cst: CstNode }} options
     * @returns {Promise<string>}
     */
    async evaluateDocument(options) {
        const { text, cst, env, resolveMacro } = options;

        if (typeof text !== 'string') {
            return '';
        }

        if (!cst) {
            return text;
        }

        if (typeof resolveMacro !== 'function') {
            throw new Error('resolveMacro must be a function');
        }

        /** @type {EvaluationContext} */
        const context = { text, env, resolveMacro };
        const items = this.#collectDocumentItems(cst);

        if (items.length === 0) {
            return text;
        }

        let result = '';
        let cursor = 0;

        for (const item of items) {
            if (item.startOffset > cursor) {
                result += text.slice(cursor, item.startOffset);
            }

            if (item.type === 'plaintext') {
                result += text.slice(item.startOffset, item.endOffset + 1);
            } else {
                result += await this.#evaluateMacroNode(item.node, context);
            }

            cursor = item.endOffset + 1;
        }

        if (cursor < text.length) {
            result += text.slice(cursor);
        }

        return result;
    }

    /**
     * Collects top-level plaintext tokens and macro nodes from the document CST.
     *
     * @param {CstNode} cst
     * @returns {Array<{ type: 'plaintext', startOffset: number, endOffset: number, token: CstToken } | { type: 'macro', startOffset: number, endOffset: number, node: CstNode }>}
     */
    #collectDocumentItems(cst) {
        /** @type {any} */
        const node = cst;
        const children = node && node.children ? node.children : {};

        /** @type {CstToken[]} */
        const plaintextTokens = children.Plaintext || [];
        /** @type {CstNode[]} */
        const macroNodes = children.macro || [];

        const items = [];

        for (const token of plaintextTokens) {
            if (typeof token.startOffset !== 'number' || typeof token.endOffset !== 'number') {
                continue;
            }

            items.push({
                type: 'plaintext',
                startOffset: token.startOffset,
                endOffset: token.endOffset,
                token,
            });
        }

        for (const macroNode of macroNodes) {
            const range = this.#getMacroRange(macroNode);
            items.push({
                type: 'macro',
                startOffset: range.startOffset,
                endOffset: range.endOffset,
                node: macroNode,
            });
        }

        items.sort((a, b) => {
            if (a.startOffset !== b.startOffset) {
                return a.startOffset - b.startOffset;
            }
            return a.endOffset - b.endOffset;
        });

        return items;
    }

    /**
     * Evaluates a single macro CST node, resolving any nested macros first.
     *
     * @param {CstNode} macroNode
     * @param {EvaluationContext} context
     * @returns {Promise<string>}
     */
    async #evaluateMacroNode(macroNode, context) {
        if (this.#macroCache.has(macroNode)) {
            return this.#macroCache.get(macroNode) || '';
        }

        const { text, env, resolveMacro } = context;

        const children = macroNode.children || {};
        const identifierTokens = children['Macro.identifier'] || [];
        /** @type {CstToken|undefined} */
        const identifierToken = identifierTokens[0];
        const name = identifierToken ? identifierToken.image : '';

        const range = this.#getMacroRange(macroNode);
        const startTokens = children['Macro.Start'] || [];
        const endTokens = children['Macro.End'] || [];
        /** @type {CstToken|undefined} */
        const startToken = startTokens[0];
        /** @type {CstToken|undefined} */
        const endToken = endTokens[0];

        const innerStart = startToken ? startToken.endOffset + 1 : range.startOffset;
        const innerEnd = endToken ? endToken.startOffset - 1 : range.endOffset;

        // Extract argument nodes from the "arguments" rule (if present)
        const argumentsNodes = children.arguments || [];
        /** @type {CstNode|undefined} */
        const argumentsNode = argumentsNodes[0];
        /** @type {CstNode[]} */
        const argumentNodes = argumentsNode && argumentsNode.children
            ? (argumentsNode.children.argument || [])
            : [];

        /** @type {string[]} */
        const args = [];
        /** @type {{ value: string, startOffset: number, endOffset: number }[]} */
        const evaluatedArguments = [];

        for (const argNode of argumentNodes) {
            const argValue = await this.#evaluateArgumentNode(argNode, context);
            args.push(argValue);

            const location = this.#getArgumentLocation(argNode);
            if (location) {
                evaluatedArguments.push({
                    value: argValue,
                    startOffset: location.startOffset,
                    endOffset: location.endOffset,
                });
            }
        }

        evaluatedArguments.sort((a, b) => a.startOffset - b.startOffset);

        // Build the inner raw string between the braces, with nested macros resolved.
        // This uses the already evaluated argument strings and preserves any text
        // between arguments (such as separators or whitespace).
        let rawInner = '';
        if (innerStart <= innerEnd) {
            let cursor = innerStart;

            for (const entry of evaluatedArguments) {
                if (entry.startOffset > cursor) {
                    rawInner += text.slice(cursor, entry.startOffset);
                }

                rawInner += entry.value;
                cursor = entry.endOffset + 1;
            }

            if (cursor <= innerEnd) {
                rawInner += text.slice(cursor, innerEnd + 1);
            }
        }

        /** @type {MacroCall} */
        const call = {
            name,
            args,
            rawInner,
            rawWithBraces: text.slice(range.startOffset, range.endOffset + 1),
            range,
            cstNode: macroNode,
            env,
        };

        const value = await resolveMacro(call);
        const stringValue = typeof value === 'string' ? value : String(value ?? '');

        this.#macroCache.set(macroNode, stringValue);
        return stringValue;
    }

    /**
     * Evaluates a single argument node by resolving nested macros and reconstructing
     * the original argument text.
     *
     * @param {CstNode} argNode
     * @param {EvaluationContext} context
     * @returns {Promise<string>}
     */
    async #evaluateArgumentNode(argNode, context) {
        const location = this.#getArgumentLocation(argNode);
        if (!location) {
            return '';
        }

        const { text } = context;
        const children = argNode.children || {};
        /** @type {CstNode[]} */
        const nestedMacros = children.macro || [];

        if (nestedMacros.length === 0) {
            return text.slice(location.startOffset, location.endOffset + 1);
        }

        const nestedWithRange = nestedMacros.map(node => ({
            node,
            range: this.#getMacroRange(node),
        }));

        nestedWithRange.sort((a, b) => a.range.startOffset - b.range.startOffset);

        let result = '';
        let cursor = location.startOffset;

        for (const entry of nestedWithRange) {
            if (entry.range.startOffset < cursor) {
                continue;
            }

            result += text.slice(cursor, entry.range.startOffset);
            result += await this.#evaluateMacroNode(entry.node, context);
            cursor = entry.range.endOffset + 1;
        }

        if (cursor <= location.endOffset) {
            result += text.slice(cursor, location.endOffset + 1);
        }

        return result;
    }

    /**
     * Computes the character range of a macro node based on its start/end tokens
     * or its own location if those are not available.
     *
     * @param {CstNode} macroNode
     * @returns {{ startOffset: number, endOffset: number }}
     */
    #getMacroRange(macroNode) {
        const children = macroNode.children || {};
        /** @type {CstToken[]} */
        const startTokens = children['Macro.Start'] || [];
        /** @type {CstToken[]} */
        const endTokens = children['Macro.End'] || [];

        const startToken = startTokens[0];
        const endToken = endTokens[0];

        if (startToken && endToken && typeof startToken.startOffset === 'number' && typeof endToken.endOffset === 'number') {
            return {
                startOffset: startToken.startOffset,
                endOffset: endToken.endOffset,
            };
        }

        const location = macroNode.location || {};
        const startOffset = typeof location.startOffset === 'number' ? location.startOffset : 0;
        const endOffset = typeof location.endOffset === 'number' ? location.endOffset : startOffset;

        return { startOffset, endOffset };
    }

    /**
     * Computes the character range of an argument node based on all its child
     * tokens and nested macros.
     *
     * @param {CstNode} argNode
     * @returns {{ startOffset: number, endOffset: number } | null}
     */
    #getArgumentLocation(argNode) {
        const children = argNode.children || {};
        let startOffset = Number.POSITIVE_INFINITY;
        let endOffset = Number.NEGATIVE_INFINITY;

        for (const key of Object.keys(children)) {
            /** @type {(CstNode|CstToken)[]} */
            const elements = children[key] || [];

            for (const element of elements) {
                if (this.#isCstNode(element)) {
                    const location = element.location;
                    if (!location) {
                        continue;
                    }

                    if (typeof location.startOffset === 'number' && location.startOffset < startOffset) {
                        startOffset = location.startOffset;
                    }
                    if (typeof location.endOffset === 'number' && location.endOffset > endOffset) {
                        endOffset = location.endOffset;
                    }
                } else if (element && typeof element.startOffset === 'number' && typeof element.endOffset === 'number') {
                    if (element.startOffset < startOffset) {
                        startOffset = element.startOffset;
                    }
                    if (element.endOffset > endOffset) {
                        endOffset = element.endOffset;
                    }
                }
            }
        }

        if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
            return null;
        }

        return { startOffset, endOffset };
    }

    /**
     * Determines whether the given value is a CST node.
     *
     * @param {any} value
     * @returns {value is CstNode}
     */
    #isCstNode(value) {
        return !!value && typeof value === 'object' && 'name' in value && 'children' in value;
    }
}

instance = MacroCstWalker.instance;
