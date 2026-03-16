import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static("public"));
app.use(express.json());

// Store active quiz rooms
const rooms = new Map();

// Room structure:
// {
//   roomCode: string,
//   roomName: string,
//   quizData: object,
//   players: Map<socketId, {name, score, answers}>,
//   currentQuestion: number,
//   started: boolean,
//   questionStartTime: timestamp,
//   questionProcessed: boolean,
//   isPublic: boolean,
//   adminId: string
// }

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateQuizAccuracy(room) {
  const totalQuestions = room.quizData.length;
  const totalPlayers = room.players.size;

  const accuracyData = [];

  for (let i = 0; i < totalQuestions; i++) {
    const questionData = room.quizData[i];
    const correctAnswer =
      questionData.choices?.correct || questionData.correctAnswer;

    let correctCount = 0;

    room.players.forEach((player) => {
      if (player.answers[i] === correctAnswer) {
        correctCount++;
      }
    });

    const accuracy =
      totalPlayers > 0 ? Math.round((correctCount / totalPlayers) * 100) : 0;

    accuracyData.push({
      questionNumber: i + 1,
      question: questionData.question,
      correctCount,
      totalPlayers,
      accuracyPercent: accuracy,
    });
  }

  return accuracyData;
}

// Generate detailed admin report
function generateAdminReport(room) {
  const results = Array.from(room.players.values())
    .map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      answers: player.answers,
    }))
    .sort((a, b) => b.score - a.score);

  return results.map((player) => ({
    username: player.name,
    score: player.score,
    totalQuestions: room.quizData.length,
    questions: room.quizData.map((q, index) => {
      const correctAnswer = q.choices?.correct || q.correctAnswer;
      return {
        questionNumber: index + 1,
        question: q.question,
        correctAnswer,
        playerAnswer: player.answers[index] || "No answer",
        isCorrect: player.answers[index] === correctAnswer,
      };
    }),
  }));
}

function endQuiz(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const results = Array.from(room.players.values())
    .map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      answers: player.answers,
    }))
    .sort((a, b) => b.score - a.score);

  io.to(roomCode).emit("quizResults", {
    results,
    winner: results[0],
  });

  // Send detailed report to admin only
  const detailedReports = generateAdminReport(room);
  io.to(room.adminId).emit("adminReport", detailedReports);
  const accuracyData = generateQuizAccuracy(room);
  io.to(room.adminId).emit("quizAccuracy", accuracyData);

  // Send individual reports to each player at quiz end
  room.players.forEach((player, socketId) => {
    const playerReport = detailedReports.find(
      (report) => report.username === player.name,
    );
    if (playerReport) {
      io.to(socketId).emit("playerReport", playerReport);
    }
  });

  console.log(`Quiz ended in room ${roomCode}`);
}

// REPLACE the existing sendQuestion function with these two:

function sendQuestionToPlayer(socket, room) {
  const player = room.players.get(socket.id);
  if (!player) return;

  const questionData = room.quizData[player.currentQuestion];
  if (!questionData) {
    socket.emit("quiz_complete_waiting");
    return;
  }

  let options = [];
  if (questionData.choices) {
    const { correct, ...wrongs } = questionData.choices;
    options = [correct, ...Object.values(wrongs).filter(Boolean)];
  } else if (questionData.options) {
    options = questionData.options;
  }
  options = options.sort(() => Math.random() - 0.5);

  socket.emit("question", {
    question: questionData.question,
    options,
    questionNumber: player.currentQuestion + 1,
    totalQuestions: room.quizData.length,
  });
}

// Keep sendQuestion for the initial broadcast on quiz start only
function sendQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const questionData = room.quizData[0];
  if (!questionData) return;

  let options = [];
  if (questionData.choices) {
    const { correct, ...wrongs } = questionData.choices;
    options = [correct, ...Object.values(wrongs).filter(Boolean)];
  } else if (questionData.options) {
    options = questionData.options;
  }
  options = options.sort(() => Math.random() - 0.5);

  io.to(roomCode).emit("question", {
    question: questionData.question,
    options,
    questionNumber: 1,
    totalQuestions: room.quizData.length,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET.IO CONNECTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.connectedAt = Date.now();

  // ── Close room ──
  socket.on("close_room", (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.adminId) return;

    io.to(roomCode).emit("roomClosed", {
      message: "The quiz has ended. Thanks for playing!",
    });

    rooms.delete(roomCode);
    console.log(`Room ${roomCode} closed by admin`);
  });

  // ── Get current player list ──
  socket.on("get_players", (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    socket.emit("player_list", {
      players: Array.from(room.players.values()),
    });
  });

  // ── Create a room ──
  socket.on("create_room", (requestedCode, callback) => {
    let roomCode = requestedCode?.trim().toUpperCase();

    if (!roomCode) {
      roomCode = generateRoomCode();
    }

    if (rooms.has(roomCode)) {
      return callback?.({ error: "Room code already exists" });
    }

    rooms.set(roomCode, {
      roomCode,
      roomName: "",
      quizData: null,
      players: new Map(),
      currentQuestion: 0,
      started: false,
      questionStartTime: null,
      questionProcessed: false,
      adminId: socket.id,
      isPublic: false,
      locked: false, // ADD THIS
    });

    socket.join(roomCode);
    socket.roomCode = roomCode;

    console.log(`Room created: ${roomCode}`);
    callback?.({ roomCode });
  });

  // ── Update room settings (public/private, name) ──
  socket.on("update_room_settings", ({ roomCode, isPublic, roomName }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.adminId) return;

    if (typeof isPublic === "boolean") {
      room.isPublic = isPublic;
    }
    if (roomName !== undefined) {
      room.roomName = roomName;
    }

    console.log(
      `Room ${roomCode} updated: public=${room.isPublic}, name=${room.roomName}`,
    );

    io.emit("public_rooms_updated");
  });

  // ── Get public rooms list ──
  socket.on("get_public_rooms", (callback) => {
    const publicRooms = Array.from(rooms.values())
      .filter((room) => room.isPublic && !room.started)
      .map((room) => ({
        roomCode: room.roomCode,
        roomName: room.roomName || "Unnamed Room",
        playerCount: room.players.size,
        hasQuiz: !!room.quizData,
      }));

    console.log(`📋 Sending ${publicRooms.length} public rooms to client`);
    callback?.(publicRooms);
  });

  // ── Join an existing room ──
  socket.on("join_room", ({ roomCode, username }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    // ADD: block entry to locked rooms
    if (room.locked) {
      socket.emit("error", {
        message: "This quiz has ended and is no longer accepting players.",
      });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;

    if (socket.id !== room.adminId) {
      const nameTaken = Array.from(room.players.values()).some(
        (p) => p.name.toLowerCase() === (username || "").toLowerCase(),
      );
      if (nameTaken) {
        socket.emit("error", {
          message: "That username is already taken. Pick another one.",
        });
        return;
      }

      room.players.set(socket.id, {
        id: socket.id,
        name: username || `Player ${room.players.size + 1}`,
        score: 0,
        answers: [],
        currentQuestion: 0, // ADD THIS
      });
    }

    socket.emit("room_joined", roomCode);
    io.to(roomCode).emit("player_joined", {
      playerId: socket.id,
      playerCount: room.players.size,
      players: Array.from(room.players.values()),
    });

    // Late joiner — start them from their own question 0
    if (room.started && room.quizData) {
      socket.emit("quizStarted", { totalQuestions: room.quizData.length });
      sendQuestionToPlayer(socket, room);
    }
  });

  // ── Upload quiz data ──
  socket.on("quizDataUploaded", ({ roomCode, quizData }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.quizData = quizData;
    room.currentQuestion = 0;

    console.log("Stored quiz:", quizData);
  });

  // ── Create quiz data ──
  socket.on("quizDataCreated", (quizData) => {
    const roomCode = socket.roomCode;
    const room = rooms.get(roomCode);

    if (room) {
      room.quizData = quizData;
      console.log(`Quiz created in room ${roomCode}`);
      io.to(roomCode).emit("quiz_ready", {
        message: "Quiz created and ready!",
      });
    }
  });

  // ── Kick user ──
  socket.on("kick_user", (id) => {
    const target = io.sockets.sockets.get(id);
    if (target) {
      target.emit("kicked");
      target.disconnect(true);
    }
  });

  // ── Start quiz ──
  socket.on("start_quiz", (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || !room.quizData || room.quizData.length === 0 || room.started)
      return;

    room.started = true;
    room.currentQuestion = 0;
    room.questionProcessed = false;

    // Initialise per-player progress
    room.players.forEach((player) => {
      player.currentQuestion = 0;
      player.answers = [];
      player.score = 0;
    });

    io.to(roomCode).emit("quizStarted", {
      totalQuestions: room.quizData.length,
    });
    sendQuestion(roomCode); // broadcast question 1 to everyone
  });

  // ── Submit answer ──
  socket.on("submit_answer", ({ roomCode, answer }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.started) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const questionIndex = player.currentQuestion;
    const questionData = room.quizData[questionIndex];
    if (!questionData) return;

    // Prevent re-submission for this question
    if (player.answers[questionIndex] !== undefined) return;

    player.answers[questionIndex] = answer;

    const correctAnswer =
      questionData.choices?.correct || questionData.correctAnswer;
    const isCorrect = answer === correctAnswer;
    if (isCorrect) player.score += 1;

    // Tell this player whether they were right
    socket.emit("question_results", {
      correctAnswer,
      isCorrect,
      score: player.score,
    });

    // Update admin with overall progress across all players & questions
    const totalAnswers = Array.from(room.players.values()).reduce(
      (sum, p) => sum + Object.keys(p.answers).length,
      0,
    );
    const totalPossible = room.players.size * room.quizData.length;
    io.to(room.adminId).emit("answer_progress", {
      answered: totalAnswers,
      total: totalPossible,
    });

    // Advance this player to their next question
    player.currentQuestion += 1;

    setTimeout(() => {
      sendQuestionToPlayer(socket, room);
    }, 1500); // brief pause so they can see the result
  });

  // ── End quiz manually ──
  socket.on("endquiz", (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.adminId) return;

    room.locked = true; // no new joiners

    endQuiz(roomCode); // sends results & reports to everyone
    socket.emit("quizEnded", roomCode);
  });

  // ── Nuke ──
  socket.on("nuke", (password) => {
    const NUKE_PASSWORD = "halliday";

    if (password === NUKE_PASSWORD) {
      console.log("💥 NUKE ACTIVATED by", socket.id);
      io.emit("triggerNuke");
    } else {
      socket.emit("error", { message: "Invalid nuke password" });
    }
  });

  // ── Disconnect ──
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    const roomCode = socket.roomCode;
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        room.players.delete(socket.id);

        io.to(roomCode).emit("player_list", {
          players: Array.from(room.players.values()),
        });

        io.to(roomCode).emit("player_left", {
          playerId: socket.id,
          playerCount: room.players.size,
        });

        const adminStillConnected = io.sockets.sockets.has(room.adminId);
        if (room.players.size === 0 && !adminStillConnected) {
          rooms.delete(roomCode);
          console.log(`Room ${roomCode} deleted (empty)`);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});
app.get("/index", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});
app.get("/join", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(join(__dirname, "public", "admin.html"));
});
app.get("/join/:roomcode", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});
app.get("/create", (req, res) => {
  res.sendFile(join(__dirname, "public", "admin.html"));
});
app.get("/helper", (req, res) => {
  res.sendFile(join(__dirname, "public", "helper.html"));
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("\n🎮 Server Commands:");
  console.log("  nuke        - Trigger nuke animation on all clients");
  console.log("  rooms       - List all active rooms");
  console.log("  players     - Show all connected players");
  console.log("  help        - Show this help message\n");
});

// ═══════════════════════════════════════════════════════════════════════════
// TERMINAL COMMAND INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

rl.prompt();

rl.on("line", (line) => {
  const command = line.trim().toLowerCase();

  switch (command) {
    case "nuke":
      console.log("💥 NUKE ACTIVATED FROM SERVER!");
      io.emit("triggerNuke");
      console.log("✅ Nuke broadcasted to all connected clients\n");
      break;

    case "rooms":
      console.log("\n📋 Active Rooms:");
      if (rooms.size === 0) {
        console.log("  No active rooms\n");
      } else {
        rooms.forEach((room, code) => {
          console.log(`  ${code} - ${room.roomName || "Unnamed"}`);
          console.log(`    Players: ${room.players.size}`);
          console.log(`    Started: ${room.started ? "Yes" : "No"}`);
          console.log(`    Public: ${room.isPublic ? "Yes" : "No"}\n`);
        });
      }
      break;

    case "players":
      console.log("\n👥 Connected Players:");
      let totalPlayers = 0;
      rooms.forEach((room, code) => {
        if (room.players.size > 0) {
          console.log(`  Room ${code}:`);
          room.players.forEach((player) => {
            console.log(`    - ${player.name} (${player.id})`);
            totalPlayers++;
          });
        }
      });
      console.log(`\n  Total: ${totalPlayers} players\n`);
      break;

    case "help":
      console.log("\n🎮 Available Commands:");
      console.log("  nuke        - Trigger nuke animation on all clients");
      console.log("  rooms       - List all active rooms");
      console.log("  players     - Show all connected players");
      console.log("  help        - Show this help message");
      console.log("  clear       - Clear the console");
      console.log("  exit/quit   - Shutdown the server\n");
      break;

    case "clear":
      console.clear();
      console.log("Server running on http://localhost:" + PORT + "\n");
      break;

    case "exit":
    case "quit":
      console.log("\n👋 Shutting down server...");
      process.exit(0);

    case "":
      break;

    default:
      console.log(`❌ Unknown command: "${command}"`);
      console.log('Type "help" for available commands\n');
      break;
  }
  rl.prompt();
});
