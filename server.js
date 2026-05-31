const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.get("/", (req, res) => res.send("Signaling server running."));

// Track rooms: roomId -> { socketId -> username }
const rooms = {};

io.on("connection", socket => {
  console.log("Connected:", socket.id);

  // Join a call room
  socket.on("join-call", ({ roomId, username }) => {
    socket.data.username = username;
    socket.data.roomId   = roomId;

    if (!rooms[roomId]) rooms[roomId] = {};

    // Tell the newcomer about everyone already in the room
    Object.entries(rooms[roomId]).forEach(([existingId, existingName]) => {
      socket.emit("user-joined", { socketId: existingId, username: existingName });
    });

    // Add newcomer to the room
    rooms[roomId][socket.id] = username;
    socket.join(roomId);

    // Tell everyone else in the room about the newcomer
    socket.to(roomId).emit("user-joined", { socketId: socket.id, username });

    console.log(`${username} joined call room: ${roomId}`);
  });

  // Relay WebRTC offer
  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { from: socket.id, username: socket.data.username, offer });
  });

  // Relay WebRTC answer
  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  // Relay ICE candidates
  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const { roomId, username } = socket.data;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId][socket.id];
      if (Object.keys(rooms[roomId]).length === 0) delete rooms[roomId];
      io.to(roomId).emit("user-left", { socketId: socket.id, username });
    }
    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
