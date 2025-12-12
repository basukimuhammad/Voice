import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public"));

let rooms = {};

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    const room = data.room;

    if (!rooms[room]) rooms[room] = [];

    if (data.type === "join") {
      rooms[room].push(ws);
      console.log("User joined room:", room);

      rooms[room].forEach((client) => {
        if (client !== ws) {
          client.send(JSON.stringify({ type: "user-join" }));
        }
      });
    }

    if (data.type === "signal") {
      rooms[room].forEach((client) => {
        if (client !== ws) client.send(JSON.stringify(data));
      });
    }
  });

  ws.on("close", () => {
    for (const room in rooms) {
      rooms[room] = rooms[room].filter((c) => c !== ws);
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log("Server running on port", port));
