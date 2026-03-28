const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let waitingUsers = [];

io.on('connection', (socket) => {
    socket.partner = null;
    socket.lastPartnerId = null;

    const removeFromQueue = () => {
        waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    };

    const findMatch = () => {
        const matchIndex = waitingUsers.findIndex(u => 
            u.id !== socket.id && 
            u.id !== socket.lastPartnerId && 
            socket.id !== u.lastPartnerId
        );

        if (matchIndex !== -1) {
            // Match found!
            const partner = waitingUsers.splice(matchIndex, 1)[0];
            
            socket.partner = partner;
            partner.partner = socket;
            
            // Remember each other to avoid immediate rematch
            socket.lastPartnerId = partner.id;
            partner.lastPartnerId = socket.id;

            // Notify both
            socket.emit('matched');
            partner.emit('matched');
        } else {
            // Wait for a match
            if (!waitingUsers.includes(socket)) {
                waitingUsers.push(socket);
            }
            socket.emit('waiting');
        }
    };

    socket.on('search_match', () => {
        // Disconnect from current partner if any
        if (socket.partner) {
            socket.partner.emit('partner_disconnected');
            socket.partner.partner = null;
            socket.partner = null;
        }

        removeFromQueue();
        findMatch();
    });

    socket.on('message', (msg) => {
        if (socket.partner) {
            socket.partner.emit('message', msg);
        }
    });

    socket.on('skip', () => {
        if (socket.partner) {
            socket.partner.emit('partner_skipped');
            socket.partner.partner = null;
            socket.partner = null;
        }
        removeFromQueue();
        findMatch(); // Instantly try to match again
    });
    
    socket.on('typing', (isTyping) => {
        if(socket.partner) {
             socket.partner.emit('typing', isTyping);
        }
    });

    // Handle sudden disconnects (closing tab)
    socket.on('disconnect', () => {
        if (socket.partner) {
            socket.partner.emit('partner_disconnected');
            socket.partner.partner = null;
            socket.partner = null;
        }
        removeFromQueue();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
