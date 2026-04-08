import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, set, get, push, onValue, onDisconnect, onChildAdded, remove, child, update, off } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDptSVObl3AyRClDe3e5eEpFOBW3PPshqs",
  authDomain: "anon-chat-lpu.firebaseapp.com",
  databaseURL: "https://anon-chat-lpu-default-rtdb.firebaseio.com",
  projectId: "anon-chat-lpu",
  storageBucket: "anon-chat-lpu.firebasestorage.app",
  messagingSenderId: "950124960792",
  appId: "1:950124960792:web:4aa76e553c0aa44214b76d",
  measurementId: "G-9ZCZRV9V5W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Generate a random User ID for this session
const uid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// DOM Elements
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

let currentRoomId = null;
let isMatched = false;
let typingTimeout;
let myQueueRef = null;
let disconnectRef = null;
let partnerListener = null;
let messageListener = null;

// Initial Setup
setStatus('connected', 'Connected');
overlayTitle.textContent = 'Ready to chat? 🚀';
overlaySubtitle.textContent = 'Click below to find a chat partner ✨';
startBtn.classList.remove('hidden');

// Matchmaking Logic
startBtn.addEventListener('click', () => {
    findMatch();
});

skipBtn.addEventListener('click', () => {
    if(!isMatched) return;
    leaveRoom(true);
});

async function findMatch() {
    showOverlay('Looking for a partner 🔍', 'Please wait.');
    startBtn.classList.add('hidden');
    disableChat();
    clearMessages();
    isMatched = false;

    if (currentRoomId) {
        await leaveRoom();
    }

    const queueRef = ref(db, 'queue');
    const snapshot = await get(queueRef);

    let matchFound = false;
    let partnerId = null;

    if (snapshot.exists()) {
        const queue = snapshot.val();
        for (const id in queue) {
            if (id !== uid && queue[id] !== 'matched') {
                // Potential match found
                partnerId = id;
                matchFound = true;
                break;
            }
        }
    }

    if (matchFound) {
        // Create Room
        currentRoomId = id_generator();
        
        // Remove partner from queue and create room
        const updates = {};
        updates[`queue/${partnerId}`] = null;
        updates[`rooms/${currentRoomId}/users/${uid}`] = true;
        updates[`rooms/${currentRoomId}/users/${partnerId}`] = true;
        updates[`user_rooms/${partnerId}`] = currentRoomId; // notify partner

        await update(ref(db), updates);
        joinRoom(currentRoomId);
    } else {
        // Enter Queue
        myQueueRef = ref(db, `queue/${uid}`);
        await set(myQueueRef, true);
        
        // Remove from queue on disconnect
        disconnectRef = onDisconnect(myQueueRef);
        disconnectRef.remove();

        // Listen for assignment
        const userRoomRef = ref(db, `user_rooms/${uid}`);
        onValue(userRoomRef, (snap) => {
            const roomId = snap.val();
            if (roomId) {
                // Someone matched with us!
                set(userRoomRef, null); // Clear notification
                if (myQueueRef) {
                    set(myQueueRef, null); // Clear from queue just in case
                }
                if (disconnectRef) {
                    disconnectRef.cancel();
                }
                joinRoom(roomId);
            }
        });
    }
}

function joinRoom(roomId) {
    currentRoomId = roomId;
    isMatched = true;

    // Remove from queue listeners
    if (myQueueRef) {
        set(myQueueRef, null);
    }
    const userRoomRef = ref(db, `user_rooms/${uid}`);
    off(userRoomRef);

    hideOverlay();
    setStatus('connected', 'Chatting with Partner 💬');
    enableChat();
    clearMessages();
    addSystemMessage('✨ You are now connected! Say hi 👋');

    // Notify partner if I disconnect
    const myPresenceRef = ref(db, `rooms/${currentRoomId}/users/${uid}`);
    const presenceDisconnect = onDisconnect(myPresenceRef);
    presenceDisconnect.remove();

    // Listen to messages
    const messagesRef = ref(db, `rooms/${currentRoomId}/messages`);
    messageListener = onChildAdded(messagesRef, (snap) => {
        const msgData = snap.val();
        if (msgData.sender !== uid) {
            addMessage(msgData.text, 'stranger');
            typingIndicator.classList.add('hidden');
        }
    });

    // Listen to partner presence
    const roomUsersRef = ref(db, `rooms/${currentRoomId}/users`);
    partnerListener = onValue(roomUsersRef, (snap) => {
        const users = snap.val();
        if (!users || Object.keys(users).length < 2) {
            // Partner left
            handlePartnerDisconnect();
        }
    });

    // Listen to typing
    const typingRef = ref(db, `rooms/${currentRoomId}/typing`);
    onValue(typingRef, (snap) => {
        const typists = snap.val();
        if (typists) {
            let isPartnerTyping = false;
            for(let key in typists) {
                if(key !== uid && typists[key]) isPartnerTyping = true;
            }
            if(isPartnerTyping) {
                typingIndicator.classList.remove('hidden');
            } else {
                typingIndicator.classList.add('hidden');
            }
        } else {
            typingIndicator.classList.add('hidden');
        }
    });
}

function handlePartnerDisconnect() {
    if (!isMatched) return;
    isMatched = false;
    setStatus('waiting', 'Partner Disconnected 🔌');
    disableChat();
    addSystemMessage('Your partner left the chat 🔌');
    typingIndicator.classList.add('hidden');
    
    leaveRoom();

    setTimeout(() => {
        if (!isMatched) {
            findMatch();
        }
    }, 2000);
}

async function leaveRoom(skipped = false) {
    if (!currentRoomId) return;

    if (skipped) {
        isMatched = false;
        setStatus('waiting', 'Searching... 🔍');
        disableChat();
        addSystemMessage('You skipped the partner ⏭️');
        typingIndicator.classList.add('hidden');
    }

    // Stop listening
    const messagesRef = ref(db, `rooms/${currentRoomId}/messages`);
    off(messagesRef);
    const roomUsersRef = ref(db, `rooms/${currentRoomId}/users`);
    off(roomUsersRef);
    const typingRef = ref(db, `rooms/${currentRoomId}/typing`);
    off(typingRef);

    // Remove presence
    await remove(ref(db, `rooms/${currentRoomId}/users/${uid}`));
    currentRoomId = null;

    if (skipped) {
        findMatch();
    }
}

// Sending Messages
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (text && isMatched && currentRoomId) {
        // Send to Firebase
        const messagesRef = ref(db, `rooms/${currentRoomId}/messages`);
        push(messagesRef, {
            text: text,
            sender: uid,
            timestamp: Date.now()
        });

        addMessage(text, 'me');
        messageInput.value = '';
        updateTypingStatus(false);
    }
}

// Typing detection
messageInput.addEventListener('input', () => {
    if (!isMatched || !currentRoomId) return;
    
    updateTypingStatus(true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        updateTypingStatus(false);
    }, 1000);
});

function updateTypingStatus(isTyping) {
    if(!currentRoomId) return;
    set(ref(db, `rooms/${currentRoomId}/typing/${uid}`), isTyping);
}

// UI Helpers
function id_generator() {
    return Math.random().toString(36).substring(2, 15);
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
