import { MacroRegistry, MacroCategory } from '../engine/MacroRegistry.js';
import { getSpriteCache } from '../../extensions/expressions/index.js';
import { characters } from '../../../script.js';

export function registerImageMacros() {
    MacroRegistry.registerMacro('img', {
        category: MacroCategory.CHARACTER,
        description: 'Returns an HTML img element for a character image in user/images.',
        usage: '{{img::imageName}}',
        unnamedArgs: [
            {
                name: 'imgNameNoExt',
                description: 'The name of the image file without extension.',
                type: 'string',
            }
        ],
        handler: (context) => {
            const imgNameNoExt = context.unnamedArgs[0];
            if (!imgNameNoExt) return '';
            const charName = context.env.character?.name || context.env.names?.char;
            if (!charName) return '';
            // Defaulting to png as we cannot check extension synchronously
            const path = `/user/images/${charName}/${imgNameNoExt}.png`;
            return `<img src="${path}" class="imgmacro" alt="${imgNameNoExt}">`;
        },
    });

    MacroRegistry.registerMacro('imgBackground', {
        category: MacroCategory.CHARACTER,
        description: 'Returns an HTML img element for a character background image.',
        usage: '{{imgBackground::imageName}}',
        unnamedArgs: [
            {
                name: 'imgNameNoExt',
                description: 'The name of the background image file without extension.',
                type: 'string',
            }
        ],
        handler: (context) => {
            const imgNameNoExt = context.unnamedArgs[0];
            if (!imgNameNoExt) return '';
            const charName = context.env.character?.name || context.env.names?.char;
            if (!charName) return '';
            // Following user requested structure: /characters/{{CharName}}/backgrounds/imgNameNoExt.ext
            // Defaulting to png
            const path = `/characters/${charName}/backgrounds/${imgNameNoExt}.png`;
            return `<img src="${path}" class="imgmacro" alt="${imgNameNoExt}">`;
        },
    });

    MacroRegistry.registerMacro('imgExpression', {
        category: MacroCategory.CHARACTER,
        description: 'Returns an HTML img element for a character expression image.',
        usage: '{{imgExpression::expressionLabel}}',
        unnamedArgs: [
            {
                name: 'expression',
                description: 'The label of the expression.',
                type: 'string',
            }
        ],
        handler: (context) => {
            const expression = context.unnamedArgs[0];
            if (!expression) return '';
            const charName = context.env.character?.name || context.env.names?.char;
            if (!charName) return '';

            let path = '';

            // Try to find in sprite cache
            const cache = getSpriteCache();

            // Find character avatar name (without extension) for cache lookup
            const char = characters.find(c => c.name === charName);
            const avatarName = char ? char.avatar.replace(/\.[^/.]+$/, '') : null;

            // Cache keys might be the character name or the avatar filename
            let charKey = Object.keys(cache).find(k => k === charName || (avatarName && k === avatarName));

            if (!charKey) {
                charKey = charName;
            }

            const sprites = cache[charKey];
            let found = false;
            if (Array.isArray(sprites)) {
                const sprite = sprites.find(s => s.label === expression);
                if (sprite && sprite.files && sprite.files.length > 0) {
                    path = sprite.files[0].imageSrc;
                    found = true;
                }
            }

            // Fallback path if not found in cache (assuming structure)
            if (!found) {
                path = `/characters/${charName}/${expression}.png`;
            }

            return `<img src="${path}" class="imgmacro" alt="${expression}">`;
        },
    });
}
