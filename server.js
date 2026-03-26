const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('.'));

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      blocks: new Map(),
      players: new Map()
    });
  }
  return rooms.get(roomId);
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

io.on('connection', (socket) => {
  let currentRoomId = null;

  socket.on('joinRoom', ({ roomId = 'lobby', name = 'Player' } = {}) => {
    if (currentRoomId) {
      socket.leave(currentRoomId);
      const oldRoom = rooms.get(currentRoomId);
      if (oldRoom) oldRoom.players.delete(socket.id);
    }

    currentRoomId = roomId;
    socket.join(roomId);

    const room = getRoom(roomId);
    room.players.set(socket.id, {
      name,
      pos: { x: 0, y: 1.6, z: 0 },
      rotY: 0
    });

    const blocks = Array.from(room.blocks.values());
    const players = Object.fromEntries(room.players.entries());
    socket.emit('worldState', { blocks, players });
  });

  socket.on('playerState', ({ roomId = currentRoomId, state } = {}) => {
    if (!roomId || !state) return;
    const room = getRoom(roomId);
    room.players.set(socket.id, state);
    socket.to(roomId).emit('playerState', { id: socket.id, state });
  });

  socket.on('setBlock', ({ roomId = currentRoomId, x, y, z, blockTypeIndex } = {}) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    const block = { x, y, z, blockTypeIndex };
    room.blocks.set(blockKey(x, y, z), block);
    socket.to(roomId).emit('blockSet', block);
  });

  socket.on('removeBlock', ({ roomId = currentRoomId, x, y, z } = {}) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    room.blocks.delete(blockKey(x, y, z));
    socket.to(roomId).emit('blockRemoved', { x, y, z });
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.players.delete(socket.id);
    socket.to(currentRoomId).emit('playerLeft', { id: socket.id });

    if (room.players.size === 0) {
      // Keep a room alive if blocks are still present so builds persist briefly.
      setTimeout(() => {
        const check = rooms.get(currentRoomId);
        if (check && check.players.size === 0) {
          rooms.delete(currentRoomId);
        }
      }, 1000 * 60 * 30);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Voxel server running on http://localhost:${PORT}`);
});
