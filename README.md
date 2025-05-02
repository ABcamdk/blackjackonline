# Multiplayer Blackjack (Online)

An online multiplayer Blackjack game built with HTML, CSS, JavaScript, and Socket.IO. Players can join a shared room and play against the dealer in real-time.

## 🎮 Features

- Join game rooms using a custom Room ID
- Visual interface with dealer and player hands
- Game phase handling (dealing, player turns, dealer turn, results)
- Real-time updates via WebSockets
- Support for multiple players per room

## 🛠️ Technologies Used

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Real-time Communication:** [Socket.IO](https://socket.io)
- **Backend:** Requires a separate Node.js server with Socket.IO (not included)

## 📁 Files

- `index.html` – The user interface of the game
- `script.js` – Client-side game logic and Socket.IO handling
- `style.css` – (Not included here, but referenced in HTML)
- `server.js` – (Needs to be implemented separately to handle the game logic)

## 🚀 Getting Started

1. **Start your Socket.IO server**
   - Make sure you have a working `server.js` using Node.js and Socket.IO
   - Host it locally (e.g., `http://localhost:3000`) or on your local network (e.g., `http://192.168.x.x:3000`)

2. **Edit `script.js`**
   - Locate this line:
     ```javascript
     const SERVER_URL = 'http://192.168.1.166:3000';
     ```
   - Replace it with your actual server IP or `http://localhost:3000` if testing locally

3. **Open `index.html` in your browser**
   - Enter a Room ID and optionally a player name
   - Click "Join Room"
   - Once enough players are connected, one can start the game

## ⚠️ Notes

- The frontend alone won’t work without a properly configured backend
- All players must connect to the same server instance
- Socket.IO is loaded via CDN – requires internet or local hosting of the library

## ✅ TODO / Improvements

- Display winner/loser more clearly in the UI
- Add authentication or persistent player profiles
- Handle disconnections more gracefully
- Make the interface mobile responsive

## 📸 Screenshots

*(Insert screenshots of the game UI here if desired)*

---

© 2025 – Multiplayer Blackjack Project
