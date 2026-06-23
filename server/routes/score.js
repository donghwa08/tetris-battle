const express = require("express");
const router = express.Router();
const mysql = require("mysql2");
require("dotenv").config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

router.post("/score", (req, res) => {
  const { player_id, score, lines_cleared, level, play_time } = req.body;

  // 점수 검증
  if (score === undefined || score === null) {
    return res.status(400).json({ message: "점수가 없습니다." });
  }

  // 게임 시간 대비 점수 검증 (초당 최대 1000점)
  if (play_time && score > play_time * 1000) {
    return res.status(400).json({ message: "비정상적인 점수입니다." });
  }
  // 라인 수 대비 점수 검증 (라인당 최대 1200점)
  if (lines_cleared && score > lines_cleared * 1200 + 10000) {
    return res.status(400).json({ message: "비정상적인 점수입니다." });
  }

  // 레벨 대비 점수 검증
  if (play_time && level > play_time / 30 + 1) {
    return res.status(400).json({ message: "비정상적인 레벨입니다." });
  }

  const sql = `INSERT INTO scores (player_id, score, lines_cleared, level, play_time) VALUES (?,?,?,?,?)`;
  db.query(
    sql,
    [player_id, score, lines_cleared, level, play_time],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "DB 저장 실패", error: err });
      }
      res.json({ message: "점수 저장 성공!" });
    },
  );
});

// 랭킹 조회 (상위 10명)
// 랭킹 조회
router.get("/ranking", (req, res) => {
  const { type, mode } = req.query;
  const filter = type || mode;

  let dateFilter = "";
  if (filter === "daily") {
    dateFilter = "AND DATE(s.created_at) = CURDATE()";
  } else if (filter === "weekly") {
    dateFilter = "AND s.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
  }

  const sql = `
    SELECT 
        u.user_id,
        MAX(s.score) AS score,
        MAX(s.level) AS level,
        MAX(s.lines_cleared) AS lines_cleared,
        DATE(MAX(s.created_at)) AS created_at
    FROM scores s
    JOIN users u ON s.player_id = u.id
    WHERE 1=1 ${dateFilter}
    GROUP BY u.user_id
    ORDER BY score DESC
    LIMIT 10
  `;

  db.query(sql, (err, results) => {
    if (err)
      return res.status(500).json({ message: "DB 조회 실패", error: err });
    const ranking = results.map((r, i) => ({ rank: i + 1, ...r }));
    res.json({ ranking });
  });
});

// 대결모드 랭킹
router.get("/battle-ranking", (req, res) => {
  const sql = `
    SELECT
        u.user_id,
        b.wins,
        b.played
    FROM battle_scores b
    JOIN users u ON b.player_id = u.id
    ORDER BY b.wins DESC
    LIMIT 10
  `;

  db.query(sql, (err, results) => {
    if (err)
      return res.status(500).json({ message: "DB 조회 실패", error: err });
    const ranking = results.map((r, i) => ({ rank: i + 1, ...r }));
    res.json({ ranking });
  });
});

// 아이템 랭킹
router.get("/item-ranking", (req, res) => {
  const sql = `
    SELECT
        u.user_id,
        b.wins,
        b.played
    FROM item_scores b
    JOIN users u ON b.player_id = u.id
    ORDER BY b.wins DESC
    LIMIT 10
  `;

  db.query(sql, (err, results) => {
    if (err)
      return res.status(500).json({ message: "DB 조회 실패", error: err });
    const ranking = results.map((r, i) => ({ rank: i + 1, ...r }));
    res.json({ ranking });
  });
});

// 대결모드 점수 저장
router.post("/battle-score", (req, res) => {
  const { player_id, wins, played } = req.body;

  const sql = `
    INSERT INTO battle_scores (player_id, wins, played)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
    wins = wins + ?, played = played + ?
  `;

  db.query(sql, [player_id, wins, played, wins, played], (err, result) => {
    if (err)
      return res.status(500).json({ message: "DB 저장 실패", error: err });
    res.json({ message: "대결 점수 저장 성공!" });
  });
});

// 아이템모드 점수 저장
router.post("/item-score", (req, res) => {
  const { player_id, wins, played } = req.body;

  const sql = `
    INSERT INTO item_scores (player_id, wins, played)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
    wins = wins + ?, played = played + ?
  `;

  db.query(sql, [player_id, wins, played, wins, played], (err, result) => {
    if (err)
      return res.status(500).json({ message: "DB 저장 실패", error: err });
    res.json({ message: "아이템 점수 저장 성공!" });
  });
});

module.exports = router;
