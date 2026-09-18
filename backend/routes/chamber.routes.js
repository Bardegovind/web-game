'use strict';

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const c = require('../controllers/chamber.controller');

// Everything behind the password.
router.use(authMiddleware);

router.get('/today', c.getToday);

router.get('/letters', c.listLetters);
router.post('/letters', c.writeLetter);
router.post('/letters/:id/open', c.openLetter);

router.get('/story', c.listStory);
router.post('/story', c.addStoryEntry);
router.delete('/story/:id', c.deleteStoryEntry);

router.get('/bucket', c.listBucket);
router.post('/bucket', c.addBucketItem);
router.patch('/bucket/:id', c.toggleBucketItem);
router.delete('/bucket/:id', c.deleteBucketItem);

router.post('/push/subscribe', c.subscribePush);
router.post('/push/unsubscribe', c.unsubscribePush);

router.get('/question', c.getQuestion);
router.post('/question', c.answerQuestion);

router.get('/us', c.getUs);
router.put('/us', c.setUs);

router.get('/reasons', c.listReasons);
router.post('/reasons', c.addReason);
router.delete('/reasons/:id', c.removeReason);

router.post('/nudge', c.sendNudge);
router.get('/nudge/pending', c.listPendingNudges);
router.post('/nudge/seen', c.markNudgesSeen);

module.exports = router;
