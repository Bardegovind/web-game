'use strict';

const DEFAULT_MINIMUM_AGE_DAYS = 30;

/** The calendar day, so "today" means the same thing to both of them. */
function dayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Chooses one item from a list, using the date itself as the seed.
 *
 * Deriving the choice from the day means both people see the same thing without
 * anything having to be scheduled, stored or kept in step — and it is stable, so
 * it does not change every time she reopens the page.
 */
function pickForDay(items, day) {
    if (!items || items.length === 0) return null;

    let hash = 0;
    for (let i = 0; i < day.length; i++) {
        hash = (hash * 31 + day.charCodeAt(i)) >>> 0;
    }

    return items[hash % items.length];
}

function createDailyService(deps) {
    const { Question, GalleryItem, prompts } = deps;
    const now = deps.now || (() => new Date());
    const minimumAgeDays = deps.minimumAgeDays ?? DEFAULT_MINIMUM_AGE_DAYS;

    /**
     * Today's question, created on first sight.
     *
     * Whoever opens the chamber first brings it into existence; the other person
     * finds the same one rather than a second question of their own.
     */
    async function questionForToday() {
        const day = dayKey(now());
        const existing = await Question.findOne({ day });
        if (existing) return existing;

        try {
            return await Question.create({ day, text: pickForDay(prompts, day), answers: [] });
        } catch (error) {
            // Entering the chamber asks for Today and the question at once, so
            // on the first entry of a day two requests can both find nothing
            // and both create. The unique index on `day` lets one win; the
            // other reads what it made.
            if (error && error.code === 11000) {
                const created = await Question.findOne({ day });
                if (created) return created;
            }
            throw error;
        }
    }

    async function answerToday({ username, text }) {
        if (typeof text !== 'string' || !text.trim()) {
            throw new Error('An answer needs some words in it.');
        }

        const question = await questionForToday();
        const name = String(username).toLowerCase();
        const answer = { username: name, text: text.trim(), answeredAt: now() };

        const existing = question.answers.findIndex((a) => a.username === name);

        // Changing her mind replaces what she said rather than adding to it.
        if (existing === -1) {
            question.answers.push(answer);
        } else {
            question.answers[existing] = answer;
        }

        await question.save();
        return question;
    }

    /**
     * An old photo, resurfacing.
     *
     * Only photos past a minimum age are eligible — something uploaded yesterday
     * is not a memory yet, and offering it as one would cheapen the idea.
     */
    async function memoryOfTheDay() {
        const cutoff = new Date(now());
        cutoff.setDate(cutoff.getDate() - minimumAgeDays);

        const all = await GalleryItem.find({}).lean();
        const eligible = all.filter((item) => new Date(item.createdAt) < cutoff);

        return pickForDay(eligible, dayKey(now()));
    }

    return { questionForToday, answerToday, memoryOfTheDay };
}

module.exports = { createDailyService, dayKey, pickForDay };
