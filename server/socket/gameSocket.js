const mysql = require("mysql2");
require("dotenv").config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

function saveBattleScore(user_id, wins, played, table) {
  const sql = `
    INSERT INTO ${table} (player_id, wins, played)
    SELECT id, ?, ? FROM users WHERE user_id = ?
    ON DUPLICATE KEY UPDATE wins = wins + ?, played = played + ?
  `;
  db.query(sql, [wins, played, user_id, wins, played], () => {});
}

module.exports = (io) => {
  const rooms = {};
  const quickQueue = [];
  const rematchReady = {};

  io.on("connection", (socket) => {
    console.log("유저 접속:", socket.id);

    socket.on("quickMatch", (data) => {
      if (data.user_id) socket.user_id = data.user_id;
      quickQueue.push({ socket, user_id: data.user_id });

      if (quickQueue.length >= 2) {
        const player1 = quickQueue.shift();
        const player2 = quickQueue.shift();

        const roomCode = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
        rooms[roomCode] = {
          players: [
            { socketId: player1.socket.id, user_id: player1.user_id },
            { socketId: player2.socket.id, user_id: player2.user_id },
          ],
          status: "playing",
        };
        player1.socket.join(roomCode);
        player2.socket.join(roomCode);

        player1.socket.emit("matchFound", {
          roomId: roomCode,
          opponent: player2.user_id,
        });
        player2.socket.emit("matchFound", {
          roomId: roomCode,
          opponent: player1.user_id,
        });
        io.to(roomCode).emit("gameStart");
      }
    });

    socket.on("cancelQuick", () => {
      const idx = quickQueue.findIndex((p) => p.socket.id === socket.id);
      if (idx !== -1) quickQueue.splice(idx, 1);
    });

    socket.on("requestRematch", (data) => {
      const roomId = data.roomId || data.roomCode;
      if (!rematchReady[roomId]) rematchReady[roomId] = [];
      rematchReady[roomId].push(socket.id);

      if (rematchReady[roomId].length === 2) {
        io.to(roomId).emit("rematchAccepted");
        delete rematchReady[roomId];
      }
    });
    socket.on("rematchDeclined", (data) => {
      const roomId = data.roomId || data.roomCode;
      socket.to(roomId).emit("rematchDeclined");
    });

    socket.on("createRoom", (data) => {
      if (data?.user_id) socket.user_id = data.user_id;
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomCode] = {
        players: [{ socketId: socket.id, user_id: data?.user_id }],
        hostId: data?.user_id,
        status: "waiting",
      };
      socket.join(roomCode);
      socket.emit("roomCreated", { roomCode, roomId: roomCode });
      console.log(`방 생성: ${roomCode}`);
    });

    socket.on("joinRoom", (data) => {
      const roomCode = data.roomCode || data.roomId || data;
      console.log(`방 입장 시도: ${roomCode}`);
      const room = rooms[roomCode];

      if (!room) {
        return socket.emit("error", { message: "존재하지 않는 방입니다." });
      }
      if (room.players.length >= 2) {
        return socket.emit("error", { message: "방이 꽉 찼습니다." });
      }

      if (data.user_id) socket.user_id = data.user_id;
      room.players.push({ socketId: socket.id, user_id: data.user_id });
      socket.join(roomCode);
      socket.emit("joinedRoom", {
        roomCode,
        roomId: roomCode,
        opponent: room.hostId,
      });
      io.to(room.players[0].socketId).emit("opponentJoined", {
        user_id: data.user_id,
      });
    });

    socket.on("sendGarbage", (data) => {
      const code = data.roomCode || data.roomId;
      socket.to(code).emit("receiveGarbage", {
        lines: data.lines,
        direct: data.direct,
      });
    });
    socket.on("sendEffect", (data) => {
      const code = data.roomCode || data.roomId;
      socket.to(code).emit("receiveEffect", {
        effect: data.effect,
        duration: data.duration,
      });
    });
    socket.on("boardUpdate", (data) => {
      const code = data.roomCode || data.roomId;
      if (rooms[code]) {
        if (!rooms[code].lastBoard) rooms[code].lastBoard = {};
        rooms[code].lastBoard[socket.id] = data.board;
      }
      socket.to(code).emit("opponentBoard", data);
    });

    socket.on("requestSwap", ({ roomId, roomCode, board }) => {
      const code = roomId || roomCode;
      const room = rooms[code];
      if (!room) return;

      const myBoard = board || room.lastBoard?.[socket.id];
      const opp = room.players.find((p) => p.socketId !== socket.id);
      const oppBoard = room.lastBoard?.[opp?.socketId];
      if (!myBoard || !oppBoard) return;

      socket.emit("swapConfirm", { board: oppBoard });
      socket.to(code).emit("receiveSwap", { board: myBoard });
    });

    socket.on("playerReady", (data) => {
      console.log("playerReady 받은 데이터:", data);
      const code = data.roomCode || data.roomId;
      socket.to(code).emit("playerReady", { ready: data.ready });
    });

    socket.on("startGame", ({ roomCode, roomId }) => {
      const code = roomCode || roomId;
      io.to(code).emit("gameStart");
    });

    // 게임 오버 - 진 사람의 user_id를 받아서 승패 판정 후 양쪽에 결과 통보
    // 결과 통보를 받은 클라이언트가 /api/battle-score 로 POST 호출해서 DB에 저장함
    socket.on("gameOver", ({ roomCode, roomId, table }) => {
      const code = roomCode || roomId;
      const room = rooms[code];
      const scoreTable = table || "battle_scores";

      if (room && room.status !== "finished") {
        room.status = "finished";

        const loser = room.players.find((p) => p.socketId === socket.id);
        const winner = room.players.find((p) => p.socketId !== socket.id);
        const loserUserId = loser?.user_id || socket.user_id;
        const winnerSocket = winner ? io.sockets.sockets.get(winner.socketId) : null;
        const winnerUserId = winner?.user_id || winnerSocket?.user_id;

        if (winner && loser) {
          if (loserUserId) saveBattleScore(loserUserId, 0, 1, scoreTable);
          if (winnerUserId) saveBattleScore(winnerUserId, 1, 1, scoreTable);

          io.to(winner.socketId).emit("battleResult", {
            result: "win",
            opponent: loser.user_id,
          });
          io.to(loser.socketId).emit("battleResult", {
            result: "lose",
            opponent: winner.user_id,
          });
        }
      }

      socket.to(code).emit("opponentOver");
    });

    socket.on("disconnect", () => {
      console.log("유저 나감:", socket.id);

      for (const roomId in rematchReady) {
        if (rematchReady[roomId].includes(socket.id)) {
          socket.to(roomId).emit("rematchDeclined");
          delete rematchReady[roomId];
        }
      }

      const idx = quickQueue.findIndex((p) => p.socket.id === socket.id);
      if (idx !== -1) quickQueue.splice(idx, 1);

      for (const roomCode in rooms) {
        const room = rooms[roomCode];
        if (room.players.some((p) => p.socketId === socket.id)) {
          socket.to(roomCode).emit("opponentLeft");
          delete rooms[roomCode];
        }
      }
    });
  });
};
