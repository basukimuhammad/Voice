import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public"));

// rooms structure: { roomName: { clients: { clientId: { ws, name } } } }
const rooms = {};

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

function broadcastUserList(roomName) {
  const r = rooms[roomName];
  if (!r) return;
  const list = Object.keys(r.clients).map(id => ({ id, name: r.clients[id].name || id }));
  Object.values(r.clients).forEach(c => {
    send(c.ws, { type: 'user-list', users: list });
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }
    const { type, room, clientId, target, payload, name } = data;

    if (type === 'join') {
      if (!rooms[room]) rooms[room] = { clients: {} };
      rooms[room].clients[clientId] = { ws, name: name || clientId };

      // send existing peers to the newcomer
      const others = Object.keys(rooms[room].clients).filter(id => id !== clientId);
      send(ws, { type: 'existing-peers', peers: others });

      // notify others
      others.forEach(id => {
        const otherWs = rooms[room].clients[id].ws;
        if (otherWs) send(otherWs, { type: 'new-peer', id: clientId });
      });

      // broadcast user list
      broadcastUserList(room);
      // notify join
      Object.values(rooms[room].clients).forEach(c => {
        if (c.ws !== ws) send(c.ws, { type: 'notify', message: `${name || clientId} joined` });
      });
      return;
    }

    if (type === 'signal') {
      const r = rooms[room];
      if (!r) return;
      const targetObj = r.clients[target];
      if (targetObj) {
        send(targetObj.ws, { type: 'signal', from: clientId, payload });
      }
      return;
    }

    if (type === 'leave') {
      if (rooms[room] && rooms[room].clients[clientId]) {
        delete rooms[room].clients[clientId];
        if (rooms[room]) Object.values(rooms[room].clients).forEach(c => send(c.ws, { type: 'peer-left', id: clientId }));
        broadcastUserList(room);
        Object.values(rooms[room].clients).forEach(c => send(c.ws, { type: 'notify', message: `${name || clientId} left` }));
      }
      return;
    }
  });

  ws.on('close', () => {
    for (const roomName of Object.keys(rooms)) {
      const r = rooms[roomName];
      for (const id of Object.keys(r.clients)) {
        if (r.clients[id].ws === ws) {
          const leftName = r.clients[id].name || id;
          delete r.clients[id];
          Object.values(r.clients).forEach(c => send(c.ws, { type: 'peer-left', id }));
          broadcastUserList(roomName);
          Object.values(r.clients).forEach(c => send(c.ws, { type: 'notify', message: `${leftName} left` }));
        }
      }
      if (Object.keys(r.clients).length === 0) delete rooms[roomName];
    }
  });
});

// keepalive
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const port = process.env.PORT || 3000;
server.listen(port, () => console.log('Server running on port', port));
