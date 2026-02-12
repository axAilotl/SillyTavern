import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';

import { invalidateThumbnail } from './thumbnails.js';
import { getOrGenerateMetadataBatch, removeMetadata, renameMetadata, thumbnailDimensions } from './image-metadata.js';
import { getImages, ensureDirectory } from '../util.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';

export const router = express.Router();

router.post('/all', async function (request, response) {
    const images = getImages(request.user.directories.backgrounds);
    const config = { width: thumbnailDimensions.bg[0], height: thumbnailDimensions.bg[1] };
    response.json({ images, config });
});

router.post('/delete', getFileNameValidationFunction('bg'), function (request, response) {
    if (!request.body) return response.sendStatus(400);

    if (request.body.bg !== sanitize(request.body.bg)) {
        console.error('Malicious bg name prevented');
        return response.sendStatus(403);
    }

    const fileName = path.join(request.user.directories.backgrounds, sanitize(request.body.bg));

    if (!fs.existsSync(fileName)) {
        console.error('BG file not found');
        return response.sendStatus(400);
    }

    fs.unlinkSync(fileName);
    invalidateThumbnail(request.user.directories, 'bg', request.body.bg);

    // Remove metadata for deleted image
    const relativePath = path.join('backgrounds', request.body.bg);
    removeMetadata(request.user.directories.root, relativePath).catch(err => {
        console.warn('[Backgrounds] Failed to remove metadata:', err.message);
    });

    return response.send('ok');
});

router.post('/rename', function (request, response) {
    if (!request.body) return response.sendStatus(400);

    const oldFileName = path.join(request.user.directories.backgrounds, sanitize(request.body.old_bg));
    const newFileName = path.join(request.user.directories.backgrounds, sanitize(request.body.new_bg));

    if (!fs.existsSync(oldFileName)) {
        console.error('BG file not found');
        return response.sendStatus(400);
    }

    if (fs.existsSync(newFileName)) {
        console.error('New BG file already exists');
        return response.sendStatus(400);
    }

    fs.copyFileSync(oldFileName, newFileName);
    fs.unlinkSync(oldFileName);
    invalidateThumbnail(request.user.directories, 'bg', request.body.old_bg);

    // Update metadata for renamed image
    const oldRelativePath = path.join('backgrounds', request.body.old_bg);
    const newRelativePath = path.join('backgrounds', request.body.new_bg);
    renameMetadata(request.user.directories.root, oldRelativePath, newRelativePath).catch(err => {
        console.warn('[Backgrounds] Failed to rename metadata:', err.message);
    });

    return response.send('ok');
});

router.post('/upload', function (request, response) {
    if (!request.body || !request.file) return response.sendStatus(400);

    const img_path = path.join(request.file.destination, request.file.filename);
    const filename = request.file.originalname;

    try {
        fs.copyFileSync(img_path, path.join(request.user.directories.backgrounds, filename));
        fs.unlinkSync(img_path);
        invalidateThumbnail(request.user.directories, 'bg', filename);

        // Generate metadata for the new image
        const relativePath = path.join('backgrounds', filename);
        getOrGenerateMetadataBatch(request.user.directories.root, [relativePath], 'bg').catch(err => {
            console.warn('[Backgrounds] Failed to generate metadata for upload:', err.message);
        });

        response.send(filename);
    } catch (err) {
        console.error(err);
        response.sendStatus(500);
    }
});

// ===== Per-character background endpoints =====

/**
 * Get the character backgrounds directory path.
 * @param {import('express').Request} request
 * @param {string} charName
 * @returns {string}
 */
function getCharacterBackgroundDir(request, charName) {
    return path.join(request.user.directories.characters, sanitize(charName), 'backgrounds');
}

router.post('/character/all', function (request, response) {
    if (!request.body?.name) return response.sendStatus(400);

    const charName = sanitize(request.body.name);
    if (!charName) return response.sendStatus(400);

    const bgDir = getCharacterBackgroundDir(request, charName);
    if (!fs.existsSync(bgDir)) {
        return response.json({ images: [] });
    }

    const images = getImages(bgDir);
    return response.json({ images });
});

router.post('/character/upload', function (request, response) {
    if (!request.body || !request.file) return response.sendStatus(400);

    const charName = sanitize(request.body.name);
    if (!charName) return response.sendStatus(400);

    const bgDir = getCharacterBackgroundDir(request, charName);
    if (!ensureDirectory(bgDir)) {
        return response.sendStatus(500);
    }

    const img_path = path.join(request.file.destination, request.file.filename);
    const filename = sanitize(request.file.originalname);

    try {
        fs.copyFileSync(img_path, path.join(bgDir, filename));
        fs.unlinkSync(img_path);
        return response.send(filename);
    } catch (err) {
        console.error(err);
        return response.sendStatus(500);
    }
});

router.post('/character/delete', function (request, response) {
    if (!request.body) return response.sendStatus(400);

    const charName = sanitize(request.body.name);
    const bgFile = sanitize(request.body.bg);
    if (!charName || !bgFile) return response.sendStatus(400);

    if (request.body.bg !== bgFile) {
        console.error('Malicious bg name prevented');
        return response.sendStatus(403);
    }

    const bgDir = getCharacterBackgroundDir(request, charName);
    const filePath = path.join(bgDir, bgFile);

    if (!fs.existsSync(filePath)) {
        return response.sendStatus(404);
    }

    try {
        fs.unlinkSync(filePath);
        return response.send('ok');
    } catch (err) {
        console.error(err);
        return response.sendStatus(500);
    }
});
