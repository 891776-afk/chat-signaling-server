const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.get("/", (req, res) => res.send("Signaling server running."));

const rooms = {};

io.on("connection", socket => {
  console.log("Connected:", socket.id);

  socket.on("join-call", ({ roomId, username }) => {
    socket.data.username = username;
    socket.data.roomId   = roomId;

    if (!rooms[roomId]) rooms[roomId] = {};

    // Tell newcomer about everyone already in room
    Object.entries(rooms[roomId]).forEach(([existingId, existingName]) => {
      socket.emit("existing-user", { socketId: existingId, username: existingName });
    });

    // Add newcomer
    rooms[roomId][socket.id] = username;
    socket.join(roomId);

    // Tell everyone else about newcomer
    socket.to(roomId).emit("user-joined", { socketId: socket.id, username });

    console.log(`${username} joined call: ${roomId}`);
  });

 socket.on("offer",         ({ to, offer })     => io.to(to).emit("offer",         { from: socket.id, username: socket.data.username, offer }));
  socket.on("answer",        ({ to, answer })    => io.to(to).emit("answer",        { from: socket.id, answer }));
  socket.on("ice-candidate", ({ to, candidate }) => io.to(to).emit("ice-candidate", { from: socket.id, candidate }));

  socket.on("leave-call", ({ roomId, username }) => {
    if (rooms[roomId]) {
      delete rooms[roomId][socket.id];
      if (Object.keys(rooms[roomId]).length === 0) delete rooms[roomId];
    }
    socket.to(roomId).emit("user-left", { socketId: socket.id, username });
    socket.leave(roomId);
  });

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
server.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);

  // Keep Render free tier awake by pinging self every 10 minutes
  setInterval(() => {
    const https = require("https");
    https.get("https://chat-signaling-server-5l9z.onrender.com", res => {
      console.log("Keep-alive ping:", res.statusCode);
    }).on("error", () => {});
  }, 10 * 60 * 1000);
});
