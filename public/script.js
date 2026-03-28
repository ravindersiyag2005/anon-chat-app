const socket = io();

// UI Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const startBtn = document.getElementById('start-btn');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const skipBtn = document.getElementById('skip-btn');
const typingIndicator = document.getElementById('typing-indicator');

let isMatched = false;
let typingTimeout;

// Connection Events
socket.on('connect', () => {
    setStatus('connected', 'Connected');
    overlayTitle.textContent = 'Ready to chat? 🚀';
    overlaySubtitle.textContent = 'Click below to find a chat partner ✨';
    startBtn.classList.remove('hidden');
});

socket.on('disconnect', () => {
    setStatus('disconnected', 'Disconnected');
    showOverlay('Connection lost.', 'Trying to reconnect...');
    startBtn.classList.add('hidden');
    disableChat();
});

// App Logic Events
socket.on('waiting', () => {
    isMatched = false;
    showOverlay('Looking for a partner 🔍', 'Please wait.');
    startBtn.classList.add('hidden');
    disableChat();
    clearMessages();
});

socket.on('matched', () => {
    isMatched = true;
    hideOverlay();
    setStatus('connected', 'Chatting with Partner 💬');
    enableChat();
    clearMessages();
    addSystemMessage('✨ You are now connected! Say hi 👋');
});

socket.on('partner_disconnected', () => {
    isMatched = false;
    setStatus('waiting', 'Partner Disconnected 🔌');
    disableChat();
    addSystemMessage('Your partner left the chat 🔌');
    typingIndicator.classList.add('hidden');
    
    // Automatically search for a new match after 2 seconds
    setTimeout(() => {
        if (!isMatched) {
            socket.emit('search_match');
        }
    }, 2000);
});

socket.on('partner_skipped', () => {
    isMatched = false;
    setStatus('waiting', 'Partner Skipped ⏭️');
    disableChat();
    addSystemMessage('Your partner skipped you ⏭️ Time to find someone new!');
    typingIndicator.classList.add('hidden');
    
    showOverlay('Partner skipped you ⏭️', 'Click below to make a new connection 🌟');
    startBtn.classList.remove('hidden');
});

socket.on('message', (msg) => {
    addMessage(msg, 'stranger');
    typingIndicator.classList.add('hidden');
});

socket.on('typing', (isTyping) => {
    if (isTyping) {
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
});

// Buttons and Input
startBtn.addEventListener('click', () => {
    socket.emit('search_match');
});

skipBtn.addEventListener('click', () => {
    if(!isMatched) return;
    socket.emit('skip');
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Typing detection
messageInput.addEventListener('input', () => {
    if (!isMatched) return;
    
    socket.emit('typing', true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
});

// Helper Functions
function sendMessage() {
    const msg = messageInput.value.trim();
    if (msg && isMatched) {
        socket.emit('message', msg);
        addMessage(msg, 'me');
        messageInput.value = '';
        socket.emit('typing', false);
    }
}

function addMessage(text, sender) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message-wrapper', sender);
    
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.textContent = text;
    
    const timeDiv = document.createElement('div');
    timeDiv.classList.add('timestamp');
    const now = new Date();
    timeDiv.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    wrapper.appendChild(msgDiv);
    wrapper.appendChild(timeDiv);
    
    messagesContainer.appendChild(wrapper);
    scrollToBottom();
}

function addSystemMessage(text) {
    const sysDiv = document.createElement('div');
    sysDiv.classList.add('system-message');
    sysDiv.textContent = text;
    messagesContainer.appendChild(sysDiv);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setStatus(type, text) {
    statusDot.className = `dot ${type}`;
    statusText.textContent = text;
}

function showOverlay(title, subtitle) {
    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle;
    overlay.classList.add('active');
    overlay.classList.remove('hidden');
    messagesContainer.classList.add('hidden');
}

function hideOverlay() {
    overlay.classList.remove('active');
    overlay.classList.add('hidden');
    messagesContainer.classList.remove('hidden');
}

function enableChat() {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    skipBtn.disabled = false;
    messageInput.focus();
}

function disableChat() {
    messageInput.disabled = true;
    sendBtn.disabled = true;
    skipBtn.disabled = true;
}

function clearMessages() {
    messagesContainer.innerHTML = '';
}
