'use strict';

const Letter = require('../models/Letter');
const StoryEntry = require('../models/StoryEntry');
const BucketItem = require('../models/BucketItem');
const Question = require('../models/Question');
const GalleryItem = require('../models/GalleryItem');
const User = require('../models/User');
const Message = require('../models/Message');
const UserConversation = require('../models/UserConversation');
const Relationship = require('../models/Relationship');
const Reason = require('../models/Reason');
const Nudge = require('../models/Nudge');

const { createLettersService } = require('../services/letters.service');
const { createDailyService } = require('../services/daily.service');
const { createChatService } = require('../services/chat.service');
const { createRelationshipService } = require('../services/relationship.service');
const { createReasonsService } = require('../services/reasons.service');
const { createNudgesService } = require('../services/nudges.service');
const { QUESTION_PROMPTS, LETTER_PROMPTS } = require('../services/prompts');
const { createNotifier } = require('../services/notifier');
const PushSubscriptionModel = require('../models/PushSubscription');
const { EVENTS, roomFor } = require('../socket/events');

const letters = createLettersService({ Letter });
const daily = createDailyService({ Question, GalleryItem, prompts: QUESTION_PROMPTS });
const chat = createChatService({ Message, UserConversation });
const notifier = createNotifier({ PushSubscription: PushSubscriptionModel, log: console.log });
const relationship = createRelationshipService({ Relationship, Message });
const reasons = createReasonsService({ Reason });
const nudges = createNudgesService({ Nudge });

/** Turns a thrown service error into a message that can be shown as-is. */
function fail(res, error, status = 400) {
    return res.status(status).json({ success: false, message: error.message });
}

/** The other person. There are only ever two. */
async function partnerOf(username) {
    const other = await User.findOne({ username: { $ne: username } }, { username: 1 }).lean();
    return other ? other.username : null;
}

/**
 * GET /api/chamber/today
 *
 * Everything waiting for her, in one request, so the chamber can open with
 * something to say rather than a blank grid.
 */
const getToday = async (req, res) => {
    try {
        const me = req.user.username;
        const peer = await partnerOf(me);

        const [
            unreadMessages, unopenedLetters, question, memory,
            daysTogether, nextAnniversary, reasonOfTheDay, pendingNudges,
        ] = await Promise.all([
            peer ? chat.unreadCount({ me, peer }) : 0,
            letters.unopenedCount(me),
            daily.questionForToday(),
            daily.memoryOfTheDay(),
            relationship.daysTogether(),
            relationship.nextAnniversary(),
            reasons.ofTheDay({}),
            nudges.pending({ username: me }),
        ]);

        const myAnswer = question.answers.find((a) => a.username === me) || null;
        const pendingNudge = pendingNudges[0] || null;

        return res.json({
            success: true,
            today: {
                unreadMessages,
                unopenedLetters,
                question: { text: question.text, answered: Boolean(myAnswer) },
                memoryOfTheDay: memory
                    ? { _id: memory._id, url: memory.url, caption: memory.caption, createdAt: memory.createdAt }
                    : null,
                daysTogether,
                nextAnniversary,
                reasonOfTheDay: reasonOfTheDay
                    ? { text: reasonOfTheDay.text, author: reasonOfTheDay.author }
                    : null,
                pendingNudge: pendingNudge
                    ? { _id: pendingNudge._id, from: pendingNudge.from, createdAt: pendingNudge.createdAt }
                    : null,
            },
        });
    } catch (error) {
        console.error('Today Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load today.' });
    }
};

// ---- Letters ----

const listLetters = async (req, res) => {
    try {
        return res.json({
            success: true,
            letters: await letters.listFor(req.user.username),
            prompts: LETTER_PROMPTS,
        });
    } catch (error) {
        console.error('Letters Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your letters.' });
    }
};

const writeLetter = async (req, res) => {
    try {
        const me = req.user.username;
        const writtenFor = await partnerOf(me);
        if (!writtenFor) return fail(res, new Error('There is no one to write to yet.'));

        const letter = await letters.write({ ...req.body, writtenBy: me, writtenFor });
        return res.status(201).json({ success: true, letter: { _id: letter._id, prompt: letter.prompt } });
    } catch (error) {
        return fail(res, error);
    }
};

const openLetter = async (req, res) => {
    try {
        const letter = await letters.open({ id: req.params.id, username: req.user.username });
        return res.json({ success: true, letter });
    } catch (error) {
        return fail(res, error, 404);
    }
};

// ---- Our story ----

const listStory = async (req, res) => {
    try {
        const entries = await StoryEntry.find({}).sort({ happenedAt: 1 }).lean();
        return res.json({ success: true, entries });
    } catch (error) {
        console.error('Story Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your story.' });
    }
};

const addStoryEntry = async (req, res) => {
    try {
        const { title, note, emoji, place, imageUrl, happenedAt } = req.body;
        if (typeof title !== 'string' || !title.trim()) {
            return fail(res, new Error('A moment needs a name.'));
        }

        const when = happenedAt ? new Date(happenedAt) : new Date();
        if (Number.isNaN(when.getTime())) return fail(res, new Error('That date did not make sense.'));

        const entry = await StoryEntry.create({
            happenedAt: when,
            title: title.trim(),
            note: typeof note === 'string' ? note.trim().slice(0, 2000) : '',
            emoji: typeof emoji === 'string' ? emoji.slice(0, 8) : '',
            place: typeof place === 'string' ? place.trim().slice(0, 120) : '',
            imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
            addedBy: req.user.username,
        });

        return res.status(201).json({ success: true, entry });
    } catch (error) {
        return fail(res, error);
    }
};

const deleteStoryEntry = async (req, res) => {
    try {
        await StoryEntry.findByIdAndDelete(req.params.id);
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error);
    }
};

// ---- Bucket list ----

const listBucket = async (req, res) => {
    try {
        const items = await BucketItem.find({}).sort({ done: 1, createdAt: 1 }).lean();
        return res.json({ success: true, items });
    } catch (error) {
        console.error('Bucket Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your list.' });
    }
};

const addBucketItem = async (req, res) => {
    try {
        const { text } = req.body;
        if (typeof text !== 'string' || !text.trim()) {
            return fail(res, new Error('Write what you want to do.'));
        }

        const item = await BucketItem.create({
            text: text.trim().slice(0, 200),
            addedBy: req.user.username,
        });
        return res.status(201).json({ success: true, item });
    } catch (error) {
        return fail(res, error);
    }
};

const toggleBucketItem = async (req, res) => {
    try {
        const item = await BucketItem.findById(req.params.id);
        if (!item) return fail(res, new Error('That is not on the list.'), 404);

        item.done = !item.done;
        item.doneAt = item.done ? new Date() : null;
        item.doneBy = item.done ? req.user.username : null;
        await item.save();

        return res.json({ success: true, item });
    } catch (error) {
        return fail(res, error);
    }
};

const deleteBucketItem = async (req, res) => {
    try {
        await BucketItem.findByIdAndDelete(req.params.id);
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error);
    }
};

// ---- Question of the day ----

const getQuestion = async (req, res) => {
    try {
        const question = await daily.questionForToday();
        return res.json({
            success: true,
            question: { day: question.day, text: question.text, answers: question.answers },
        });
    } catch (error) {
        console.error('Question Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load today\'s question.' });
    }
};

const answerQuestion = async (req, res) => {
    try {
        const question = await daily.answerToday({
            username: req.user.username,
            text: req.body.text,
        });
        return res.json({
            success: true,
            question: { day: question.day, text: question.text, answers: question.answers },
        });
    } catch (error) {
        return fail(res, error);
    }
};

// ---- Us ----

/** The current answer, in one shape, for both GET and PUT. */
async function usPayload() {
    const [{ startDate, source }, daysTogether, nextAnniversary] = await Promise.all([
        relationship.get(),
        relationship.daysTogether(),
        relationship.nextAnniversary(),
    ]);
    return { startDate, source, daysTogether, nextAnniversary };
}

const getUs = async (req, res) => {
    try {
        return res.json({ success: true, ...(await usPayload()) });
    } catch (error) {
        console.error('Us Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the two of you.' });
    }
};

const setUs = async (req, res) => {
    try {
        await relationship.set({ date: req.body.date, username: req.user.username });
        return res.json({ success: true, ...(await usPayload()) });
    } catch (error) {
        return fail(res, error);
    }
};

// ---- Reasons ----

const listReasons = async (req, res) => {
    try {
        return res.json({ success: true, reasons: await reasons.list() });
    } catch (error) {
        console.error('Reasons Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the jar.' });
    }
};

const addReason = async (req, res) => {
    try {
        const reason = await reasons.add({ text: req.body.text, author: req.user.username });
        return res.status(201).json({ success: true, reason });
    } catch (error) {
        return fail(res, error);
    }
};

const removeReason = async (req, res) => {
    try {
        await reasons.remove({ id: req.params.id, author: req.user.username });
        return res.json({ success: true });
    } catch (error) {
        // Mirrors how a letter that is not hers is handled: one clean status
        // for "not here" and "not yours" alike.
        return fail(res, error, 404);
    }
};

// ---- Thinking of you ----

const sendNudge = async (req, res) => {
    try {
        const me = req.user.username;
        const to = await partnerOf(me);
        if (!to) return fail(res, new Error('There is no one to nudge yet.'));

        const result = await nudges.send({ from: me, to });

        if (!result.sent) {
            return res.status(429).json({ success: false, sent: false, reason: result.reason });
        }

        // Live if she is there; the REST call has already succeeded either way.
        const io = req.app.get('io');
        if (io) {
            try {
                io.to(roomFor(to)).emit(EVENTS.NUDGE_NEW, { from: me, createdAt: result.nudge.createdAt });
            } catch (error) {
                // It is already saved and waiting for her; a failure to announce
                // it live must not tell him it never went.
                console.error('Nudge announce failed:', error);
            }
        }

        return res.json({ success: true, sent: true });
    } catch (error) {
        return fail(res, error);
    }
};

const listPendingNudges = async (req, res) => {
    try {
        const waiting = await nudges.pending({ username: req.user.username });
        return res.json({
            success: true,
            nudges: waiting.map((n) => ({ _id: n._id, from: n.from, createdAt: n.createdAt })),
        });
    } catch (error) {
        console.error('Nudge Error:', error);
        return res.status(500).json({ success: false, message: 'Could not load nudges.' });
    }
};

const markNudgesSeen = async (req, res) => {
    try {
        const seen = await nudges.markSeen({ username: req.user.username });
        return res.json({ success: true, seen });
    } catch (error) {
        return fail(res, error);
    }
};

// ---- Push ----

/**
 * POST /api/chamber/push/subscribe
 *
 * Remembers where a device can be reached. Inert until push is configured,
 * which needs a secure origin — so this stores the subscription and says so
 * honestly rather than implying notifications now work.
 */
const subscribePush = async (req, res) => {
    try {
        await notifier.subscribe({
            username: req.user.username,
            subscription: req.body.subscription,
        });
        return res.json({ success: true, active: notifier.configured });
    } catch (error) {
        return fail(res, error);
    }
};

const unsubscribePush = async (req, res) => {
    try {
        await notifier.unsubscribe(req.body.endpoint);
        return res.json({ success: true });
    } catch (error) {
        return fail(res, error);
    }
};

module.exports = {
    getToday,
    subscribePush, unsubscribePush,
    listLetters, writeLetter, openLetter,
    listStory, addStoryEntry, deleteStoryEntry,
    listBucket, addBucketItem, toggleBucketItem, deleteBucketItem,
    getQuestion, answerQuestion,
    getUs, setUs,
    listReasons, addReason, removeReason,
    sendNudge, listPendingNudges, markNudgesSeen,
};
