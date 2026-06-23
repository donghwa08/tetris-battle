const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mysql = require('mysql2');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

//MySQL 연결
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if(err) {
        console.error('DB 연결 실패:', err);
        return;
    }
    console.log('DB 연결 성공!');
});

//미들웨어
app.use(cors({
    origin: "*"
}));
app.use(express.json());

//라우터 연결
const scoreRouter = require('./routes/score');
const authRouter = require('./routes/auth');
app.use('/api', scoreRouter);
app.use('/api', authRouter);

//소켓 연결
require('./socket/gameSocket') (io);

//서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버 실행중 : http://localhost:${PORT}`);

});
 