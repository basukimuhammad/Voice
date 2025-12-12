// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public"));

/**
 rooms = {
   roomName: {
     clients: { clientId: ws, ... }
   }
 }
*/
const rooms = {};

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }
    const { type, room, clientId, target, payload } = data;

    if (type === "join") {
      if (!rooms[room]) rooms[room] = { clients: {} };
      // store ws by id
      rooms[room].clients[clientId] = ws;

      // gather existing ids
      const others = Object.keys(rooms[room].clients).filter(id => id !== clientId);

      // send existing peers to the newcomer
      send(ws, { type: "existing-peers", peers: others });

      // notify others that a new peer joined
      others.forEach(id => {
        const otherWs = rooms[room].clients[id];
        if (otherWs) send(otherWs, { type: "new-peer", id: clientId });
      });

      return;
    }

    if (type === "signal") {
      // forward signal to target
      const r = rooms[room];
      if (!r) return;
      const targetWs = r.clients[target];
      if (targetWs) send(targetWs, { type: "signal", from: clientId, payload });
      return;
    }

    if (type === "leave") {
      // handled in close below
      ws.close();
      return;
    }
  });

  ws.on("close", () => {
    // find and remove from any room
    for (const roomName of Object.keys(rooms)) {
      const r = rooms[roomName];
      for (const id of Object.keys(r.clients)) {
        if (r.clients[id] === ws) {
          delete r.clients[id];
          // notify remaining peers
          Object.values(r.clients).forEach(cws => {
            send(cws, { type: "peer-left", id });
          });
        }
      }
      // clean empty room
      if (Object.keys(r.clients).length === 0) delete rooms[roomName];
    }
  });

});

// ping/pong to keep connections healthy
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const port = process.env.PORT || 3000;
server.listen(port, () => console.log("Server running on port", port));
