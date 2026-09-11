'use strict';

/**
 * The pool the daily question is drawn from.
 *
 * Kept deliberately ordinary — questions you would actually ask each other,
 * rather than icebreakers. One is chosen per day from the date itself, so both
 * of them get the same one without anything being scheduled.
 */
const QUESTION_PROMPTS = [
    'If we could disappear anywhere for 24 hours, where would we go?',
    'What is the smallest thing I do that you like?',
    'What were you thinking the first time we spoke?',
    'What should we do next month that we keep putting off?',
    'What is something you have never told me?',
    'Which day would you live again exactly as it was?',
    'What do you want more of, and what do you want less of?',
    'What is the best thing anyone has ever said to you?',
    'What were you like at sixteen?',
    'What would you do with a completely free Sunday?',
    'What is something you changed your mind about?',
    'Which photo of us is your favourite, and why that one?',
    'What are you looking forward to?',
    'What is a small thing that made you happy this week?',
    'What do you think I worry about too much?',
    'Where should we be in five years?',
    'What song reminds you of me?',
    'What is something you want to be better at?',
    'What would you tell the version of you from a year ago?',
    'What is the nicest thing about an ordinary day with me?',
];

/** The prompts a letter can be written against. */
const LETTER_PROMPTS = [
    'Open when you miss me',
    'Open when you are having a bad day',
    'Open when you are angry with me',
    'Open when you cannot sleep',
    'Open when you want to smile',
    'Open when you need to know something',
];

module.exports = { QUESTION_PROMPTS, LETTER_PROMPTS };
