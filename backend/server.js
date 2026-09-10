require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Config
const connectDB = require('./config/db');

// Models
const MasterPassword = require('./models/MasterPassword');
const User = require('./models/User');
const Message = require('./models/Message');
const ChamberUser = require('./models/ChamberUser');

// Services
const { seedUsers } = require('./services/seedUsers');
const { conversationKeyFor } = require('./services/chat.service');
const { backfillConversationKeys } = require('./services/backfillConversationKeys');
const { configureAuth } = require('./controllers/auth.controller');

// Routes
const authRoutes = require('./routes/auth.routes');
const galleryRoutes = require('./routes/gallery.routes');
const chatRoutes = require('./routes/chat.routes');

// A message longer than this is not a message, it is a payload.
const MAX_MESSAGE_LENGTH = 4000;

// The frontend is served by this same process, so cross-origin access is not
// needed for normal use and is off unless explicitly configured. '*' was
// shipped with a comment saying it was for development.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

const corsOptions = ALLOWED_ORIGINS.length > 0
    ? { origin: ALLOWED_ORIGINS, credentials: true }
    : { origin: false };

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, ALLOWED_ORIGINS.length > 0
    ? { cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'], credentials: true } }
    : {});

// ========================
// MIDDLEWARE
// ========================
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ========================
// API ROUTES
// ========================
app.use('/api/auth', authRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// An unknown API route is a 404, not the app shell. Without this the SPA
// fallback returns HTML with a 200 and every fetch in the client fails on
// JSON.parse instead of surfacing the real error.
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'Not found.' });
});

// Serve frontend for all non-API routes (SPA fallback)
app.get('{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ========================
// SOCKET.IO — REAL-TIME CHAT
// ========================

// Authenticate socket connections with JWT
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Authentication required'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded; // { username, iat, exp }
        next();
    } catch (error) {
        return next(new Error('Invalid token'));
    }
});

io.on('connection', async (socket) => {
    const username = socket.user.username;
    console.log(`🟢 ${username} connected (socket: ${socket.id})`);

    // Register/update user in DB
    await ChamberUser.findOneAndUpdate(
        { username },
        { isOnline: true, socketId: socket.id, lastSeen: new Date() },
        { upsert: true, new: true }
    );

    // Broadcast updated user list to all connected clients
    const onlineUsers = await ChamberUser.find({ isOnline: true }, { username: 1, isOnline: 1 });
    io.emit('users:online', onlineUsers);

    // ---- SEND MESSAGE ----
    socket.on('message:send', async (data) => {
        try {
            const { receiver, text, type, fileUrl } = data;

            if (!receiver) return;

            // Save message to DB
            const to = String(receiver).toLowerCase();
            const message = await Message.create({
                sender: username,
                receiver: to,
                text: text ? String(text).trim().slice(0, MAX_MESSAGE_LENGTH) : '',
                type: type || 'text',
                fileUrl: fileUrl || null,
                conversationKey: conversationKeyFor(username, to),
            });

            const msgData = {
                _id: message._id,
                sender: message.sender,
                receiver: message.receiver,
                text: message.text,
                type: message.type,
                fileUrl: message.fileUrl,
                createdAt: message.createdAt,
            };

            // Send to receiver if online
            const receiverUser = await ChamberUser.findOne({ username: receiver.toLowerCase() });

            if (receiverUser && receiverUser.socketId) {
                io.to(receiverUser.socketId).emit('message:receive', msgData);
            }

            // Confirm delivery to sender
            socket.emit('message:sent', msgData);
        } catch (error) {
            console.error('Message send error:', error);
            socket.emit('message:error', { message: 'Failed to send message.' });
        }
    });

    // ---- TYPING INDICATOR ----
    socket.on('typing:start', async (data) => {
        const receiverUser = await ChamberUser.findOne({ username: data.receiver });
        if (receiverUser && receiverUser.socketId) {
            io.to(receiverUser.socketId).emit('typing:start', { sender: username });
        }
    });

    socket.on('typing:stop', async (data) => {
        const receiverUser = await ChamberUser.findOne({ username: data.receiver });
        if (receiverUser && receiverUser.socketId) {
            io.to(receiverUser.socketId).emit('typing:stop', { sender: username });
        }
    });

    // ---- DISCONNECT ----
    socket.on('disconnect', async () => {
        console.log(`🔴 ${username} disconnected`);

        await ChamberUser.findOneAndUpdate(
            { username },
            { isOnline: false, socketId: null, lastSeen: new Date() }
        );

        // Broadcast updated user list
        const onlineUsers = await ChamberUser.find({ isOnline: true }, { username: 1, isOnline: 1 });
        io.emit('users:online', onlineUsers);
    });
});

// ========================
// SEED MASTER PASSWORD
// ========================
const seedMasterPassword = async () => {
    try {
        const plainPassword = process.env.MASTER_PASSWORD;

        if (!plainPassword) {
            console.error('❌ MASTER_PASSWORD not set in .env file!');
            process.exit(1);
        }

        const existing = await MasterPassword.findOne();

        if (!existing) {
            // First time — hash and store
            const salt = await bcrypt.genSalt(12);
            const hash = await bcrypt.hash(plainPassword, salt);
            await MasterPassword.create({ passwordHash: hash });
            console.log('🔐 Master password hashed and stored in database.');
        } else {
            // Check if .env password matches stored hash
            const isMatch = await bcrypt.compare(plainPassword, existing.passwordHash);
            if (!isMatch) {
                // Password changed in .env — update the hash
                const salt = await bcrypt.genSalt(12);
                const hash = await bcrypt.hash(plainPassword, salt);
                existing.passwordHash = hash;
                await existing.save();
                console.log('🔐 Master password updated to match .env.');
            } else {
                console.log('🔐 Master password is up to date.');
            }
        }
    } catch (error) {
        console.error('❌ Error seeding master password:', error);
    }
};

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    // Connect to MongoDB
    await connectDB();

    // Seed master password on first run (legacy path)
    await seedMasterPassword();

    // Seed the two real accounts, if they are configured. Reports 'legacy' when
    // they are not, in which case sign-in behaves exactly as it always has.
    const { mode } = await seedUsers({ User, env: process.env, log: console.log });
    configureAuth(mode);

    // Give any messages written before the conversation key existed one now.
    // Idempotent and additive — it only ever adds a field derived from the
    // document's own sender and receiver.
    await backfillConversationKeys({ Message, log: console.log });

    server.listen(PORT, () => {
        console.log(`\n🚀 Server running on http://localhost:${PORT}`);
        console.log(`📡 Socket.IO ready for connections`);
        console.log(`🎮 Game: http://localhost:${PORT}\n`);
    });
};

startServer();
