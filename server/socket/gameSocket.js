module.exports = (io) => {
  const rooms = {};
  const quickQueue = [];
  const rematchReady = {};

  io.on("connection", (socket) => {
    console.log("유저 접속:", socket.id);

    // 빠른 대전
    socket.on("quickMatch", (data) => {
      quickQueue.push({ socket, user_id: data.user_id });

      if (quickQueue.length >= 2) {
        const player1 = quickQueue.shift();
        const player2 = quickQueue.shift();

        const roomCode = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
        rooms[roomCode] = {
          players: [player1.socket.id, player2.socket.id],
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
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomCode] = {
        players: [socket.id],
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

      room.players.push(socket.id);
      socket.join(roomCode);
      socket.emit("joinedRoom", {
        roomCode,
        roomId: roomCode,
        opponent: rooms[roomCode].hostId,
      });
      io.to(room.players[0]).emit("opponentJoined", { user_id: data.user_id });
    });

    //방해블록 전송
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
    // 상대 보드 실시간 전송 ← 여기 추가
    socket.on("boardUpdate", (data) => {
      const code = data.roomCode || data.roomId;
      socket.to(code).emit("opponentBoard", data);
    });

    socket.on("playerReady", (data) => {
      console.log("playerReady 받은 데이터:", data); // 뭐가 오는지 확인
      const code = data.roomCode || data.roomId;
      socket.to(code).emit("playerReady", { ready: data.ready });
    });

    // 바로 아래 startGame
    socket.on("startGame", ({ roomCode, roomId }) => {
      const code = roomCode || roomId;
      io.to(code).emit("gameStart");
    });
    //게임 오버
    socket.on("gameOver", ({ roomCode, roomId }) => {
      const code = roomCode || roomId;
      socket.to(code).emit("opponentOver");
      if (rooms[code]) {
        rooms[code].status = "finished";
      }
    });

    socket.on("disconnect", () => {
      console.log("유저 나감:", socket.id);

      // 다시하기 대기 정리
      for (const roomId in rematchReady) {
        if (rematchReady[roomId].includes(socket.id)) {
          socket.to(roomId).emit("rematchDeclined");
          delete rematchReady[roomId];
        }
      }

      // 대기열 정리
      const idx = quickQueue.findIndex((p) => p.socket.id === socket.id);
      if (idx !== -1) quickQueue.splice(idx, 1);

      for (const roomCode in rooms) {
        const room = rooms[roomCode];
        if (room.players.includes(socket.id)) {
          socket.to(roomCode).emit("opponentLeft");
          delete rooms[roomCode];
        }
      }
    });
  });
};
