CREATE DATABASE tetris;
USE tetris;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  game_type ENUM('single', 'battle', 'item_battle') NOT NULL DEFAULT 'single',
  score INT NOT NULL,
  lines_cleared INT DEFAULT 0,
  level INT DEFAULT 1,
  play_time INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES users(id),
  INDEX idx_game_type (game_type),
  INDEX idx_game_type_score (game_type, score DESC)
);

CREATE TABLE battle_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  wins INT DEFAULT 0,
  played INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_player (player_id),
  FOREIGN KEY (player_id) REFERENCES users(id)
);

CREATE TABLE item_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  wins INT DEFAULT 0,
  played INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_player (player_id),
  FOREIGN KEY (player_id) REFERENCES users(id)
);

CREATE TABLE rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_code VARCHAR(6) NOT NULL UNIQUE,
  player1_id INT,
  player2_id INT,
  status ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player1_id) REFERENCES users(id),
  FOREIGN KEY (player2_id) REFERENCES users(id)
);