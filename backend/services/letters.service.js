'use strict';

/**
 * "Open when..." letters.
 *
 * Written ahead of time and left waiting. An unopened letter gives away nothing
 * but its prompt — the whole idea depends on not being able to peek.
 */
function createLettersService(deps) {
    const { Letter } = deps;
    const now = deps.now || (() => new Date());

    /**
     * What is waiting for someone.
     *
     * The body is withheld until it has been opened, so the list itself cannot
     * be read ahead.
     */
    async function listFor(username) {
        const rows = await Letter.find({ writtenFor: String(username).toLowerCase() })
            .sort({ createdAt: -1 })
            .lean();

        return rows.map((row) => {
            const isOpened = Boolean(row.openedAt);

            return {
                _id: row._id,
                prompt: row.prompt,
                writtenBy: row.writtenBy,
                createdAt: row.createdAt,
                isOpened,
                openedAt: row.openedAt || null,
                ...(isOpened ? { body: row.body } : {}),
            };
        });
    }

    /**
     * Opens a letter and records the moment — once.
     *
     * Reading it again later does not rewrite when she first needed it.
     */
    async function open({ id, username }) {
        const letter = await Letter.findById(id);
        if (!letter) throw new Error('That letter is not here.');

        if (letter.writtenFor !== String(username).toLowerCase()) {
            throw new Error('That letter is not for you.');
        }

        if (!letter.openedAt) {
            letter.openedAt = now();
            await letter.save();
        }

        return {
            _id: letter._id,
            prompt: letter.prompt,
            body: letter.body,
            writtenBy: letter.writtenBy,
            openedAt: letter.openedAt,
            isOpened: true,
        };
    }

    async function write({ prompt, body, writtenBy, writtenFor }) {
        if (typeof prompt !== 'string' || !prompt.trim()) {
            throw new Error('A letter needs to say when to open it.');
        }
        if (typeof body !== 'string' || !body.trim()) {
            throw new Error('A letter needs something in it.');
        }

        return Letter.create({
            prompt: prompt.trim(),
            body: body.trim(),
            writtenBy: String(writtenBy).toLowerCase(),
            writtenFor: String(writtenFor).toLowerCase(),
            openedAt: null,
        });
    }

    async function unopenedCount(username) {
        const rows = await Letter.find({ writtenFor: String(username).toLowerCase() })
            .sort({ createdAt: -1 })
            .lean();

        return rows.filter((row) => !row.openedAt).length;
    }

    return { listFor, open, write, unopenedCount };
}

module.exports = { createLettersService };
