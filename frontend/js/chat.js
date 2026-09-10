/**
 * Chat Module
 * Handles Socket.IO messaging, unread counts, and emoji picker
 */
const chat = {
    socket: null,
    currentUsername: null,
    chattingWith: null,
    messages: [],
    unreadCount: 0,
    typingTimeout: null,

    // DOM elements
    userListEl: null,
    usersEmptyEl: null,
    chatPlaceholder: null,
    chatActive: null,
    chatWithEl: null,
    messagesContainer: null,
    chatInput: null,
    sendBtn: null,
    typingIndicator: null,
    chatBadge: null,

    // Track unread messages
    unreadCount: 0,

    init() {
        // UI Elements
        this.userListEl = document.getElementById('user-list');
        this.usersEmptyEl = document.getElementById('users-empty');
        this.chatPlaceholder = document.getElementById('chat-placeholder');
        this.chatActive = document.getElementById('chat-active');
        this.messagesContainer = document.getElementById('messages-container');
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('btn-send-message');
        this.chatWithEl = document.getElementById('chat-with');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.chatBadge = document.getElementById('chat-badge');

        // Emoji elements
        this.emojiBtn = document.getElementById('btn-emoji');
        this.emojiPicker = document.getElementById('emoji-picker');

        // Image elements
        this.photoInput = document.getElementById('chat-photo-input');

        // Send button
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Enter key to send
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Typing indicator
        this.chatInput.addEventListener('input', () => this.handleTyping());

        // Photo handler
        this.photoInput.addEventListener('change', (e) => this.handlePhotoUpload(e));

        this.initEmojiPicker();
    },

    /**
     * Handle Image/Photo Upload
     */
    async handlePhotoUpload(e) {
        if (!e.target.files[0]) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        // Visual feedback during upload
        const tempId = 'temp-' + Date.now();
        this.appendMessage({
            _id: tempId,
            sender: this.currentUsername,
            type: 'text',
            text: '📤 Uploading image...',
            createdAt: new Date(),
        });
        this.scrollToBottom();

        try {
            const result = await api.upload('/chat/upload', formData);
            if (result.success) {
                // Remove temp message
                const tempMsg = document.getElementById(tempId);
                if (tempMsg) tempMsg.remove();

                // Send image via Socket.IO
                this.socket.emit('message:send', {
                    receiver: this.chattingWith,
                    type: 'image',
                    fileUrl: result.fileUrl
                });
            }
        } catch (error) {
            console.error('Photo upload failed:', error);
            alert('Failed to upload image.');
        } finally {
            e.target.value = '';
        }
    },

    /**
     * Emoji Picker Logic
     */
    initEmojiPicker() {
        const emojis = [
            '😊', '😂', '🔥', '❤️', '👍', '🙏', '💯', '✨',
            '😎', '🎉', '😢', '😍', '🤔', '🙌', '🚀', '⭐',
            '🤣', '🥺', '😭', '🤩', '👋', '👏', '🤝', '✅'
        ];

        // Fill the picker
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.textContent = emoji;
            span.onclick = () => {
                this.chatInput.value += emoji;
                this.chatInput.focus();
                this.emojiPicker.style.display = 'none';
            };
            this.emojiPicker.appendChild(span);
        });

        // Toggle picker
        this.emojiBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = this.emojiPicker.style.display === 'none';
            this.emojiPicker.style.display = isHidden ? 'grid' : 'none';
        };

        // Close on outside click
        document.addEventListener('click', () => {
            this.emojiPicker.style.display = 'none';
        });

        this.emojiPicker.onclick = (e) => e.stopPropagation();
    },

    /**
     * Connect to Socket.IO with JWT
     */
    connect(username) {
        this.currentUsername = username;
        const token = localStorage.getItem('chamber_token');

        this.socket = io({
            auth: { token },
        });

        // Online users list update
        this.socket.on('users:online', (users) => {
            this.renderUserList(users);
        });

        // Receive message
        this.socket.on('message:receive', (msg) => {
            if (this.chattingWith === msg.sender) {
                this.messages.push(msg);
                this.appendMessage(msg);
                this.scrollToBottom();
            } else {
                this.unreadCount++;
                this.updateBadge();
            }
        });

        // Sent confirmation
        this.socket.on('message:sent', (msg) => {
            this.messages.push(msg);
            this.appendMessage(msg);
            this.scrollToBottom();
        });

        // Typing indicators
        this.socket.on('typing:start', (data) => {
            if (this.chattingWith === data.sender) {
                this.typingIndicator.style.display = 'inline';
            }
        });

        this.socket.on('typing:stop', (data) => {
            if (this.chattingWith === data.sender) {
                this.typingIndicator.style.display = 'none';
            }
        });
    },

    /**
     * Disconnect socket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.chattingWith = null;
        this.messages = [];
        this.unreadCount = 0;
    },

    /**
     * Merge all chamber users (Online + Offline) into sidebar
     */
    async renderUserList(onlineUsers = []) {
        try {
            // First, get ALL users from API
            const result = await api.get('/chat/users');
            if (result.success) {
                const allUsers = result.users.filter(u => u.username !== this.currentUsername);

                if (allUsers.length === 0) {
                    this.usersEmptyEl.classList.add('show');
                    this.userListEl.innerHTML = '';
                    return;
                }

                this.usersEmptyEl.classList.remove('show');
                this.userListEl.innerHTML = '';

                // Extract online usernames
                const onlineNames = onlineUsers.map(u => u.username);

                allUsers.forEach((user) => {
                    const isOnline = onlineNames.includes(user.username);

                    const item = document.createElement('div');
                    item.className = `user-item ${this.chattingWith === user.username ? 'active' : ''}`;

                    // Nodes rather than a markup string. A username is only as
                    // trustworthy as whoever typed it, which on the legacy
                    // shared-password path is anyone at all.
                    const dot = document.createElement('span');
                    dot.className = `user-status-dot ${isOnline ? 'online' : 'offline'}`;

                    const name = document.createElement('span');
                    name.className = 'user-item-name';
                    name.textContent = `@${user.username}`;

                    const status = document.createElement('span');
                    status.className = 'user-status-text';
                    status.textContent = isOnline ? 'Online' : 'Offline';

                    const info = document.createElement('div');
                    info.className = 'user-item-info';
                    info.appendChild(name);
                    info.appendChild(status);

                    item.appendChild(dot);
                    item.appendChild(info);
                    item.addEventListener('click', () => this.openChat(user.username));
                    this.userListEl.appendChild(item);
                });
            }
        } catch (error) {
            console.error('Sidebar error:', error);
        }
    },

    /**
     * Open a DM chat with a specific user
     */
    async openChat(username) {
        this.chattingWith = username;
        this.chatWithEl.textContent = `@${username}`;
        this.chatPlaceholder.style.display = 'none';
        this.chatActive.style.display = 'flex';
        this.typingIndicator.style.display = 'none';

        // Reset unread
        this.unreadCount = 0;
        this.updateBadge();

        // Highlight active user in sidebar
        document.querySelectorAll('.user-item').forEach(el => {
            const name = el.querySelector('.user-item-name')?.textContent;
            el.classList.toggle('active', name === `@${username}`);
        });

        // Load message history
        this.messagesContainer.innerHTML = '';
        this.messages = [];

        try {
            const result = await api.get(`/chat/messages/${username}`);
            if (result.success) {
                this.messages = result.messages;
                result.messages.forEach(msg => this.appendMessage(msg));
                this.scrollToBottom();
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }

        this.chatInput.focus();
    },

    /**
     * Send a message
     */
    sendMessage() {
        const text = this.chatInput.value.trim();
        if (!text || !this.chattingWith) return;

        this.socket.emit('message:send', {
            receiver: this.chattingWith,
            text,
            type: 'text'
        });

        this.chatInput.value = '';

        // Stop typing indicator
        this.socket.emit('typing:stop', { receiver: this.chattingWith });
    },

    /**
     * Append a single message to the chat view
     */
    appendMessage(msg) {
        const bubble = document.createElement('div');
        bubble.id = msg._id || 'temp-' + Date.now();

        const isSent = msg.sender === this.currentUsername;
        const isImage = msg.type === 'image';
        bubble.className = `message-bubble ${isSent ? 'sent' : 'received'} ${isImage ? 'media' : ''}`;

        // Everything below builds nodes and sets properties. Nothing that came
        // from another person is ever parsed as markup: a stored message runs on
        // every open, and the token guarding the whole chamber is readable from
        // localStorage by anything that executes here.
        if (isImage) {
            const image = document.createElement('img');
            image.className = 'chat-image';
            image.src = msg.fileUrl;
            image.alt = 'Shared photo';
            image.addEventListener('click', () => gallery.openLightbox(msg.fileUrl));
            bubble.appendChild(image);
        } else {
            const body = document.createElement('span');
            body.className = 'message-text';
            // Line breaks are preserved by CSS (white-space: pre-wrap) rather
            // than by turning newlines into markup.
            body.textContent = msg.text || '';
            bubble.appendChild(body);
        }

        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date(msg.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
        bubble.appendChild(time);

        this.messagesContainer.appendChild(bubble);
    },

    /**
     * Scroll chat to bottom instantly
     */
    scrollToBottom() {
        requestAnimationFrame(() => {
            const lastMsg = this.messagesContainer.lastElementChild;
            if (lastMsg) {
                lastMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
            } else {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        });
    },

    /**
     * Handle typing indicator
     */
    handleTyping() {
        if (!this.chattingWith || !this.socket) return;

        this.socket.emit('typing:start', { receiver: this.chattingWith });

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.socket.emit('typing:stop', { receiver: this.chattingWith });
        }, 1500);
    },

    /**
     * Update unread chat badge
     */
    updateBadge() {
        if (this.unreadCount > 0) {
            this.chatBadge.textContent = this.unreadCount;
            this.chatBadge.style.display = 'inline';
        } else {
            this.chatBadge.style.display = 'none';
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    chat.init();
});
