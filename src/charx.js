import fs from 'node:fs';
import path from 'node:path';
import _ from 'lodash';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { extractFileFromZipBuffer, extractFilesFromZipBuffer, normalizeZipEntryPath } from './util.js';
import { DEFAULT_AVATAR_PATH } from './constants.js';
import { invalidateThumbnail } from './endpoints/thumbnails.js';

const CHARX_EMBEDDED_URI_PREFIXES = ['embeded://', 'embedded://', '__asset:'];
const CHARX_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'apng', 'avif', 'bmp', 'jfif']);
const CHARX_SPRITE_TYPES = new Set(['emotion', 'expression']);
const CHARX_BACKGROUND_TYPES = new Set(['background']);

// ZIP local file header signature: PK\x03\x04
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

/**
 * Find ZIP data start in buffer (handles SFX/self-extracting archives).
 * @param {Buffer} buffer
 * @returns {Buffer} Buffer starting at ZIP signature, or original if not found
 */
function findZipStart(buffer) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const index = buf.indexOf(ZIP_SIGNATURE);
    if (index > 0) {
        console.debug(`CharX: Found ZIP signature at offset ${index} (SFX archive)`);
        return buf.slice(index);
    }
    return buf;
}

export class CharXParser {
    #data;

    /**
     * @param {ArrayBuffer|Buffer} data
     */
    constructor(data) {
        // Handle SFX (self-extracting) ZIP archives by finding the actual ZIP start
        this.#data = findZipStart(Buffer.isBuffer(data) ? data : Buffer.from(data));
    }

    async parse() {
        console.info('Importing from CharX');
        const cardBuffer = await extractFileFromZipBuffer(this.#data, 'card.json');

        if (!cardBuffer) {
            throw new Error('Failed to extract card.json from CharX file');
        }

        console.debug('CharX: Parsing card.json');
        const card = JSON.parse(cardBuffer.toString());

        if (card.spec === undefined) {
            throw new Error('Invalid CharX card file: missing spec field');
        }

        console.debug(`CharX: Card spec=${card.spec}, name=${card.data?.name || card.name}`);

        const embeddedAssets = this.collectCharXAssets(card);
        console.debug(`CharX: Found ${embeddedAssets.length} total assets`);

        const iconAsset = this.pickCharXIconAsset(embeddedAssets);
        console.debug('CharX: Icon asset:', iconAsset ? `${iconAsset.name} (${iconAsset.zipPath})` : 'none');

        const auxiliaryAssets = this.mapCharXAssetsForStorage(embeddedAssets);
        console.debug(`CharX: Mapped ${auxiliaryAssets.length} auxiliary assets for storage`);

        const archivePaths = new Set();

        if (iconAsset?.zipPath) {
            archivePaths.add(iconAsset.zipPath);
        }
        for (const asset of auxiliaryAssets) {
            if (asset?.zipPath) {
                archivePaths.add(asset.zipPath);
            }
        }

        console.debug(`CharX: Extracting ${archivePaths.size} asset files from archive`);
        let extractedBuffers = new Map();
        if (archivePaths.size > 0) {
            extractedBuffers = await extractFilesFromZipBuffer(this.#data, [...archivePaths]);
            console.debug(`CharX: Extracted ${extractedBuffers.size} asset files`);
        }

        /** @type {string|Buffer} */
        let avatar = DEFAULT_AVATAR_PATH;
        if (iconAsset?.zipPath) {
            const iconBuffer = extractedBuffers.get(iconAsset.zipPath);
            if (iconBuffer) {
                avatar = iconBuffer;
            }
        }

        return { card, avatar, auxiliaryAssets, extractedBuffers };
    }

    getEmbeddedZipPathFromUri(uri) {
        if (typeof uri !== 'string') {
            return null;
        }

        const trimmed = uri.trim();
        if (!trimmed) {
            return null;
        }

        const lower = trimmed.toLowerCase();
        for (const prefix of CHARX_EMBEDDED_URI_PREFIXES) {
            if (lower.startsWith(prefix)) {
                const rawPath = trimmed.slice(prefix.length);
                return normalizeZipEntryPath(rawPath);
            }
        }

        return null;
    }

    /**
     * Normalize extension string: lowercase, strip leading dot.
     * @param {string} ext
     * @returns {string}
     */
    normalizeExtString(ext) {
        if (typeof ext !== 'string') return '';
        return ext.trim().toLowerCase().replace(/^\./, '');
    }

    deriveCharXAssetExtension(assetExt, zipPath) {
        const metaExt = this.normalizeExtString(assetExt);
        const pathExt = this.normalizeExtString(path.extname(zipPath || ''));
        return metaExt || pathExt;
    }

    collectCharXAssets(card) {
        const assets = _.get(card, 'data.assets');
        if (!Array.isArray(assets)) {
            return [];
        }

        return assets.map((asset, index) => {
            if (!asset) {
                return null;
            }

            const zipPath = this.getEmbeddedZipPathFromUri(asset.uri);
            if (!zipPath) {
                return null;
            }

            const ext = this.deriveCharXAssetExtension(asset.ext, zipPath);
            const type = typeof asset.type === 'string' ? asset.type.toLowerCase() : '';
            const name = typeof asset.name === 'string' ? asset.name : '';

            return {
                type,
                name,
                ext,
                zipPath,
                order: index,
            };
        }).filter(Boolean);
    }

    pickCharXIconAsset(assets) {
        const iconAssets = assets.filter(asset => asset.type === 'icon' && CHARX_IMAGE_EXTENSIONS.has(asset.ext) && asset.zipPath);
        if (iconAssets.length === 0) {
            return null;
        }

        const mainIcon = iconAssets.find(asset => asset.name?.toLowerCase() === 'main');
        return mainIcon || iconAssets[0];
    }

    /**
     * Normalize asset name for filesystem storage.
     * @param {string} name - Original asset name
     * @param {string} fallback - Fallback name if normalization fails
     * @param {boolean} useHyphens - Use hyphens instead of underscores (for sprites)
     * @returns {string} Normalized filename base (without extension)
     */
    getCharXAssetBaseName(name, fallback, useHyphens = false) {
        const cleaned = (String(name ?? '').trim() || '');
        if (!cleaned) {
            return fallback.toLowerCase();
        }

        const separator = useHyphens ? '-' : '_';
        // Convert to lowercase, collapse non-alphanumeric runs to separator, trim edges
        const base = cleaned
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, separator)
            .replace(new RegExp(`^${separator}|${separator}$`, 'g'), '');

        if (!base) {
            return fallback.toLowerCase();
        }

        const sanitized = sanitize(base);
        return (sanitized || fallback).toLowerCase();
    }

    mapCharXAssetsForStorage(assets) {
        return assets.reduce((acc, asset) => {
            if (!asset?.zipPath) {
                return acc;
            }

            const ext = (asset.ext || '').toLowerCase();
            if (!CHARX_IMAGE_EXTENSIONS.has(ext)) {
                return acc;
            }

            if (asset.type === 'icon' || asset.type === 'user_icon') {
                return acc;
            }

            let storageCategory;
            if (CHARX_SPRITE_TYPES.has(asset.type)) {
                storageCategory = 'sprite';
            } else if (CHARX_BACKGROUND_TYPES.has(asset.type)) {
                storageCategory = 'background';
            } else if (asset.type) {
                storageCategory = 'misc';
            } else {
                storageCategory = 'misc';
            }

            // Use hyphens for sprites so ST's expression label extraction works correctly
            // (sprites.js extracts label via regex that splits on dash or dot)
            const useHyphens = storageCategory === 'sprite';
            acc.push({
                ...asset,
                ext,
                storageCategory,
                baseName: this.getCharXAssetBaseName(asset.name, `${storageCategory}-${asset.order ?? 0}`, useHyphens),
            });

            return acc;
        }, []);
    }
}

function ensureFolder(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        } else if (!fs.statSync(dirPath).isDirectory()) {
            console.warn(`CharX: Path ${dirPath} exists and is not a directory.`);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`CharX: Failed to prepare directory ${dirPath}`, error);
        return false;
    }
}

function getUniqueAssetPath(dirPath, baseName, ext) {
    const safeExt = ext || 'png';
    let suffix = 0;
    let candidate = `${baseName}.${safeExt}`;

    while (fs.existsSync(path.join(dirPath, candidate))) {
        suffix++;
        candidate = `${baseName}_${suffix}.${safeExt}`;
    }

    return path.join(dirPath, candidate);
}

/**
 * Persist extracted CharX assets to appropriate ST directories.
 * Note: Uses sync writes consistent with ST's existing file handling.
 * @param {Array} assets - Mapped assets from CharXParser
 * @param {Map<string, Buffer>} bufferMap - Extracted file buffers
 * @param {Object} directories - User directories object
 * @param {string} characterFolder - Character folder name (sanitized)
 * @returns {{sprites: number, backgrounds: number, misc: number}}
 */
export function persistCharXAssets(assets, bufferMap, directories, characterFolder) {
    /** @type {{sprites: number, backgrounds: number, misc: number}} */
    const summary = { sprites: 0, backgrounds: 0, misc: 0 };
    if (!Array.isArray(assets) || assets.length === 0) {
        return summary;
    }

    let spritesPath = null;
    let miscPath = null;

    const ensureSpritesPath = () => {
        if (spritesPath) {
            return spritesPath;
        }
        const candidate = path.join(directories.characters, characterFolder);
        if (!ensureFolder(candidate)) {
            return null;
        }
        spritesPath = candidate;
        return spritesPath;
    };

    const ensureMiscPath = () => {
        if (miscPath) {
            return miscPath;
        }
        // Use the image gallery path: user/images/{characterName}/
        const candidate = path.join(directories.userImages, characterFolder);
        if (!ensureFolder(candidate)) {
            return null;
        }
        miscPath = candidate;
        return miscPath;
    };

    for (const asset of assets) {
        if (!asset?.zipPath) {
            continue;
        }
        const buffer = bufferMap.get(asset.zipPath);
        if (!buffer) {
            console.warn(`CharX: Asset ${asset.zipPath} missing or unsupported, skipping.`);
            continue;
        }

        if (asset.storageCategory === 'sprite') {
            const targetDir = ensureSpritesPath();
            if (!targetDir) {
                continue;
            }
            const filePath = getUniqueAssetPath(targetDir, asset.baseName, asset.ext);
            writeFileAtomicSync(filePath, buffer);
            console.debug(`CharX: Saved sprite "${asset.name}" (${asset.type}) as ${path.basename(filePath)}`);
            summary.sprites += 1;
            continue;
        }

        if (asset.storageCategory === 'background') {
            if (!ensureFolder(directories.backgrounds)) {
                continue;
            }
            const backgroundBaseName = `${characterFolder}_${asset.baseName}`;
            const filePath = getUniqueAssetPath(directories.backgrounds, backgroundBaseName, asset.ext);
            writeFileAtomicSync(filePath, buffer);
            invalidateThumbnail(directories, 'bg', path.basename(filePath));
            console.debug(`CharX: Saved background "${asset.name}" as ${path.basename(filePath)}`);
            summary.backgrounds += 1;
            continue;
        }

        if (asset.storageCategory === 'misc') {
            const miscDir = ensureMiscPath();
            if (!miscDir) {
                continue;
            }
            const filePath = getUniqueAssetPath(miscDir, asset.baseName, asset.ext);
            writeFileAtomicSync(filePath, buffer);
            console.debug(`CharX: Saved misc asset "${asset.name}" (${asset.type}) as ${path.basename(filePath)}`);
            summary.misc += 1;
        }
    }

    return summary;
}
