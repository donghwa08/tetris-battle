const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
require("dotenv").config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// 회원가입
router.post("/register", async (req, res) => {
  const { username, user_id, password, password_confirm } = req.body;

  if (!username || !user_id || !password || !password_confirm) {
    return res.status(400).json({ message: "모든 항목을 입력해주세요." });
  }

  if (password !== password_confirm) {
    return res.status(400).json({ message: "비밀번호가 일치하지 않습니다." });
  }

  // 중복 아이디 확인
  const checkSql = `SELECT * FROM users WHERE user_id = ?`;
  db.query(checkSql, [user_id], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB 오류", error: err });
    if (results.length > 0)
      return res.status(400).json({ message: "이미 존재하는 아이디입니다." });

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);

    const insertSql = `INSERT INTO users (username, user_id, password) VALUES (?, ?, ?)`;
    db.query(insertSql, [username, user_id, hashedPassword], (err, result) => {
      if (err)
        return res.status(500).json({ message: "DB 저장 실패", error: err });
      res.json({ message: "회원가입 성공!" });
    });
  });
});

// 로그인
router.post("/login", (req, res) => {
  const { user_id, password } = req.body;

  console.log("로그인 시도:", user_id);

  const sql = `SELECT * FROM users WHERE user_id = ?`;
  db.query(sql, [user_id], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB 오류", error: err });
    if (results.length === 0)
      return res
        .status(401)
        .json({ message: "아이디 또는 비밀번호가 틀렸습니다." });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res
        .status(401)
        .json({ message: "아이디 또는 비밀번호가 틀렸습니다." });

    const token = jwt.sign(
      { id: user.id, user_id: user.user_id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({
      message: "로그인 성공!",
      token,
      user: { id: user.id, username: user.username, user_id: user.user_id },
    });
  });
});

module.exports = router;
