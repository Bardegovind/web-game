'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLESHEET = path.join(__dirname, '..', '..', 'frontend', 'public', 'css', 'style.css');
const css = fs.readFileSync(STYLESHEET, 'utf8');

const declared = [...new Set([...css.matchAll(/(?<![\w-])(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]))];
const used = [...new Set([...css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map((m) => m[1]))];

/**
 * The chamber's Tailwind and shadcn theme variables are declared on :root in a
 * cascade layer that outranks the game's stylesheet. Any game variable sharing
 * a name — --radius-md, --font-mono — is silently replaced and the game changes
 * appearance. A prefix makes that collision impossible.
 */
test('every custom property the game declares is namespaced', () => {
    assert.ok(declared.length > 0, 'the stylesheet should declare its variables');

    const bare = declared.filter((name) => !name.startsWith('--game-'));
    assert.deepEqual(bare, [], `rename these to --game-*: ${bare.join(', ')}`);
});

test('every custom property the game uses is one it declares', () => {
    const missing = used.filter((name) => !declared.includes(name));
    assert.deepEqual(missing, [], `these would resolve to nothing: ${missing.join(', ')}`);
});
