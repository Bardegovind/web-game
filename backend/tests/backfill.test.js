'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { backfillConversationKeys } = require('../services/backfillConversationKeys');
const { conversationKeyFor } = require('../services/chat.service');

function fakeMessages(docs) {
    return {
        docs,
        find(query) {
            const rows = docs.filter((d) => d.conversationKey === undefined || d.conversationKey === null);
            return { limit: () => ({ lean: async () => rows.slice(0, 500) }) };
        },
        async updateOne(query, update) {
            const doc = docs.find((d) => d._id === query._id);
            Object.assign(doc, update.$set);
        },
    };
}

test('existing messages get a key derived from who sent and received them', async () => {
    const Message = fakeMessages([
        { _id: 'a', sender: 'her', receiver: 'him', text: 'hi' },
        { _id: 'b', sender: 'him', receiver: 'her', text: 'hello' },
    ]);

    const result = await backfillConversationKeys({ Message });

    assert.equal(result.updated, 2);
    const expected = conversationKeyFor('her', 'him');
    assert.equal(Message.docs[0].conversationKey, expected);
    assert.equal(Message.docs[1].conversationKey, expected, 'both directions share one key');
});

test('message content is never touched', async () => {
    const Message = fakeMessages([
        { _id: 'a', sender: 'her', receiver: 'him', text: 'something she said', type: 'text' },
    ]);

    await backfillConversationKeys({ Message });

    assert.equal(Message.docs[0].text, 'something she said', 'the backfill must only add a key');
    assert.equal(Message.docs[0].type, 'text');
});

test('running it again changes nothing', async () => {
    const Message = fakeMessages([
        { _id: 'a', sender: 'her', receiver: 'him', conversationKey: conversationKeyFor('her', 'him') },
    ]);

    const result = await backfillConversationKeys({ Message });

    assert.equal(result.updated, 0, 'already-keyed messages are skipped');
});

test('an empty collection is fine', async () => {
    const result = await backfillConversationKeys({ Message: fakeMessages([]) });
    assert.equal(result.updated, 0);
});
