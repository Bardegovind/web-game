'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatService, conversationKeyFor } = require('../services/chat.service');

const HER = 'her';
const HIM = 'him';

/**
 * A stand-in for the messages collection that honours sort, limit and a
 * createdAt cursor — the three things the history query actually depends on.
 */
function fakeMessages(docs) {
    return {
        lastQuery: null,
        find(query) {
            this.lastQuery = query;
            let rows = docs.filter((d) => {
                if (query.conversationKey && d.conversationKey !== query.conversationKey) return false;
                if (query.createdAt && query.createdAt.$lt && !(d.createdAt < query.createdAt.$lt)) return false;
                return true;
            });

            const chain = {
                sort(spec) {
                    const dir = spec.createdAt;
                    rows = rows.slice().sort((a, b) => dir * (a.createdAt - b.createdAt));
                    return chain;
                },
                limit(n) {
                    rows = rows.slice(0, n);
                    return chain;
                },
                lean() { return Promise.resolve(rows); },
                then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
            };
            return chain;
        },
        async countDocuments(query) {
            return docs.filter((d) => {
                if (query.conversationKey && d.conversationKey !== query.conversationKey) return false;
                if (query.sender && d.sender !== query.sender) return false;
                if (query.createdAt && query.createdAt.$gt && !(d.createdAt > query.createdAt.$gt)) return false;
                return true;
            }).length;
        },
    };
}

/** `count` messages, one per minute, oldest first. */
function buildHistory(count) {
    const key = conversationKeyFor(HER, HIM);
    return Array.from({ length: count }, (_, i) => ({
        _id: `m${i}`,
        conversationKey: key,
        sender: i % 2 === 0 ? HER : HIM,
        receiver: i % 2 === 0 ? HIM : HER,
        text: `message ${i}`,
        createdAt: new Date(2026, 0, 1, 0, i),
    }));
}

test('a conversation key is the same whichever way round the two names come', () => {
    assert.equal(conversationKeyFor(HER, HIM), conversationKeyFor(HIM, HER));
});

test('different pairs get different keys', () => {
    assert.notEqual(conversationKeyFor(HER, HIM), conversationKeyFor(HER, 'someone'));
});

test('conversation keys ignore capitalisation', () => {
    assert.equal(conversationKeyFor('Her', 'HIM'), conversationKeyFor(HER, HIM));
});

/**
 * The bug that silently freezes the chat: sorting oldest-first and taking 200
 * returns the first 200 messages ever sent, so once a conversation passes that
 * mark every new message becomes invisible on reload.
 */
test('history returns the newest messages, not the oldest', async () => {
    const chat = createChatService({ Message: fakeMessages(buildHistory(250)) });

    const messages = await chat.history({ me: HER, peer: HIM, limit: 200 });

    assert.equal(messages.length, 200);
    assert.equal(messages[messages.length - 1].text, 'message 249', 'the most recent message must be included');
    assert.equal(messages[0].text, 'message 50', 'the window should be the last 200, not the first');
});

test('history is returned oldest-first so it renders top to bottom', async () => {
    const chat = createChatService({ Message: fakeMessages(buildHistory(10)) });

    const messages = await chat.history({ me: HER, peer: HIM, limit: 200 });

    const times = messages.map((m) => m.createdAt.getTime());
    assert.deepEqual(times, times.slice().sort((a, b) => a - b), 'messages must read in chronological order');
});

test('a short conversation comes back whole', async () => {
    const chat = createChatService({ Message: fakeMessages(buildHistory(5)) });

    const messages = await chat.history({ me: HER, peer: HIM, limit: 200 });

    assert.equal(messages.length, 5);
    assert.equal(messages[0].text, 'message 0');
    assert.equal(messages[4].text, 'message 4');
});

test('history is scoped to the two people in it', async () => {
    const Message = fakeMessages(buildHistory(10));
    const chat = createChatService({ Message });

    await chat.history({ me: HER, peer: HIM, limit: 200 });

    assert.equal(
        Message.lastQuery.conversationKey,
        conversationKeyFor(HER, HIM),
        'one indexed key, rather than an $or across both directions'
    );
});

test('paging back with a cursor returns the messages before it', async () => {
    const chat = createChatService({ Message: fakeMessages(buildHistory(250)) });

    const firstPage = await chat.history({ me: HER, peer: HIM, limit: 200 });
    const older = await chat.history({
        me: HER, peer: HIM, limit: 200, before: firstPage[0].createdAt,
    });

    assert.equal(older.length, 50, 'the remaining older messages');
    assert.equal(older[older.length - 1].text, 'message 49');
});

/** A stand-in for the per-person read cursor. */
function fakeConversations(records) {
    const rows = records ? records.slice() : [];
    return {
        rows,
        findOne(query) {
            const found = rows.find((r) => r.userId === query.userId && r.peerId === query.peerId) || null;
            return { lean: async () => found, then: (res, rej) => Promise.resolve(found).then(res, rej) };
        },
        async findOneAndUpdate(query, update) {
            const existing = rows.find((r) => r.userId === query.userId && r.peerId === query.peerId);
            if (existing) {
                existing.lastReadAt = update.$set.lastReadAt;
                return existing;
            }
            const created = { ...query, lastReadAt: update.$set.lastReadAt };
            rows.push(created);
            return created;
        },
    };
}

test('a conversation she has never opened counts as fully unread', async () => {
    const chat = createChatService({
        Message: fakeMessages(buildHistory(10)),
        UserConversation: fakeConversations([]),
    });

    const unread = await chat.unreadCount({ me: HER, peer: HIM });

    assert.equal(unread, 5, 'the five messages he sent are all unread');
});

test('only the other person\'s messages count as unread', async () => {
    const chat = createChatService({
        Message: fakeMessages(buildHistory(10)),
        UserConversation: fakeConversations([]),
    });

    const hers = await chat.unreadCount({ me: HIM, peer: HER });

    assert.equal(hers, 5, 'her own messages must never show up as unread to her');
});

test('reading the conversation clears the count', async () => {
    const chat = createChatService({
        Message: fakeMessages(buildHistory(10)),
        UserConversation: fakeConversations([]),
    });

    await chat.markRead({ me: HER, peer: HIM, at: new Date(2026, 0, 2) });

    assert.equal(await chat.unreadCount({ me: HER, peer: HIM }), 0);
});

test('messages arriving after she read it are unread again', async () => {
    const history = buildHistory(10);
    const chat = createChatService({
        Message: fakeMessages(history),
        UserConversation: fakeConversations([]),
    });

    // She reads up to message 4. He sent 5, 7 and 9 after that.
    await chat.markRead({ me: HER, peer: HIM, at: history[4].createdAt });

    assert.equal(await chat.unreadCount({ me: HER, peer: HIM }), 3);
});

/**
 * The behaviour the in-memory counter could never provide: the badge has to be
 * right after a refresh, a logout, a dropped socket or a phone going to sleep.
 * Because the count is derived from a stored timestamp, a brand new service
 * instance reports exactly the same number.
 */
test('the unread count survives losing all client state', async () => {
    const history = buildHistory(10);
    const conversations = fakeConversations([]);

    const before = createChatService({ Message: fakeMessages(history), UserConversation: conversations });
    await before.markRead({ me: HER, peer: HIM, at: history[4].createdAt });
    const countBefore = await before.unreadCount({ me: HER, peer: HIM });

    // Everything client-side is gone; only what was stored remains.
    const after = createChatService({ Message: fakeMessages(history), UserConversation: conversations });
    const countAfter = await after.unreadCount({ me: HER, peer: HIM });

    assert.equal(countAfter, countBefore, 'the badge must not reset itself just because she reloaded');
    assert.equal(countAfter, 3);
});
