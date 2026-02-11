import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";

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
//   isPublic: boolean,
//   adminId: string
// }

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Shuffle array (for randomizing answer options)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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
      // ── Flexible correct answer lookup ──
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

  // ✅ Send individual reports to each player at quiz end
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

function sendQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const questionData = room.quizData[room.currentQuestion];
  if (!questionData) {
    endQuiz(roomCode);
    return;
  }

  // ── Handle variable number of choices ──
  let options = [];

  if (questionData.choices) {
    // Format: { choices: { correct, wrong1, wrong2, ... } }
    const { correct, ...wrongs } = questionData.choices;
    options = [correct, ...Object.values(wrongs).filter(Boolean)];
  } else if (questionData.options) {
    // Alternative format: { options: ["answer1", "answer2", ...], correctAnswer: "answer1" }
    options = questionData.options;
  }

  // Shuffle the options
  options = options.sort(() => Math.random() - 0.5);

  io.to(roomCode).emit("question", {
    question: questionData.question,
    options,
    questionNumber: room.currentQuestion + 1,
  });

  room.questionStartTime = Date.now();
}

// ─── All socket handlers live inside this single callback ───────────────────
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // ── Get current player list ──────────────────────────────────────────────
  socket.on("get_players", (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    socket.emit("player_list", {
      players: Array.from(room.players.values()),
    });
  });

  // ── Create a room ────────────────────────────────────────────────────────
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
      roomName: "", // Will be updated when quiz is configured
      quizData: null,
      players: new Map(),
      currentQuestion: 0,
      started: false,
      questionStartTime: null,
      adminId: socket.id,
      isPublic: false, // Default to private
    });

    socket.join(roomCode);
    socket.roomCode = roomCode;

    console.log(`Room created: ${roomCode}`);
    callback?.({ roomCode });
  });

  // ── Update room settings (public/private, name) ─────────────────────────
  socket.on("update_room_settings", ({ roomCode, isPublic, roomName }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.adminId) return; // Only admin can update

    if (typeof isPublic === "boolean") {
      room.isPublic = isPublic;
    }
    if (roomName !== undefined) {
      room.roomName = roomName;
    }

    console.log(
      `Room ${roomCode} updated: public=${room.isPublic}, name=${room.roomName}`,
    );

    // Broadcast updated public room list
    io.emit("public_rooms_updated");
  });

  // ── Get public rooms list ────────────────────────────────────────────────
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

  // ── Join an existing room ────────────────────────────────────────────────
  socket.on("join_room", ({ roomCode, username }) => {
    const room = rooms.get(roomCode);

    console.log("👤 JOIN:", {
      roomCode,
      username,
      adminId: room?.adminId,
      socketId: socket.id,
    });

    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    if (room.started) {
      socket.emit("error", { message: "Quiz already started" });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;

    // Don't add admin as a player
    if (socket.id !== room.adminId) {
      // ── Check for duplicate username ──
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
      });
    }

    socket.emit("room_joined", roomCode);
    io.to(roomCode).emit("player_joined", {
      playerId: socket.id,
      playerCount: room.players.size,
      players: Array.from(room.players.values()),
    });
  });

  // ── Upload quiz data ─────────────────────────────────────────────────────
  socket.on("quizDataUploaded", ({ roomCode, quizData }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.quizData = quizData;
    room.currentQuestion = 0;

    console.log("Stored quiz:", quizData);
  });

  // ── Create quiz data ─────────────────────────────────────────────────────
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

  // ── Start quiz ───────────────────────────────────────────────────────────
  socket.on("start_quiz", (roomCode) => {
    console.log("start_quiz received with:", roomCode);

    const room = rooms.get(roomCode);
    if (!room) {
      console.log("❌ No room found");
      return;
    }

    if (!room.quizData) {
      console.log("❌ No quizData in room");
      return;
    }

    if (room.quizData.length === 0) {
      console.log("❌ quizData is empty");
      return;
    }

    if (room.started) {
      console.log("❌ quiz already started");
      return;
    }

    console.log("✅ All checks passed, starting quiz");

    room.started = true;
    room.currentQuestion = 0;

    io.to(roomCode).emit("quizStarted", {
      totalQuestions: room.quizData.length,
    });

    sendQuestion(roomCode);
  });

  // ── Submit answer ────────────────────────────────────────────────────────
  socket.on("submit_answer", ({ roomCode, answer }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const questionData = room.quizData[room.currentQuestion];
    if (!questionData) return;

    player.answers[room.currentQuestion] = answer;

    // ── Support both formats ──
    const correctAnswer =
      questionData.choices?.correct || questionData.correctAnswer;

    if (answer === correctAnswer) {
      player.score += 1;
    }

    // ── Broadcast answer progress ──
    const answeredCount = Array.from(room.players.values()).filter(
      (p) => p.answers[room.currentQuestion] !== undefined,
    ).length;
    io.to(roomCode).emit("answer_progress", {
      answered: answeredCount,
      total: room.players.size,
    });

    // Check if all players answered
    const allAnswered = Array.from(room.players.values()).every(
      (p) =>
        p.id === room.adminId || p.answers[room.currentQuestion] !== undefined,
    );

    if (allAnswered) {
      io.to(roomCode).emit("question_results", {
        correctAnswer,
        scores: Array.from(room.players.values()).map((p) => ({
          name: p.name,
          score: p.score,
        })),
      });

      // ✅ Send updated admin report after each question
      const detailedReports = generateAdminReport(room);
      io.to(room.adminId).emit("adminReport", detailedReports);

      // ✅ Send individual reports to each player
      room.players.forEach((player, socketId) => {
        const playerReport = detailedReports.find(
          (report) => report.username === player.name,
        );
        if (playerReport) {
          io.to(socketId).emit("playerReport", playerReport);
        }
      });

      room.currentQuestion += 1;

      setTimeout(() => sendQuestion(roomCode), 2000);
    }
  });

  // ── End quiz manually ────────────────────────────────────────────────────
  socket.on("endquiz", (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.adminId) return;

    endQuiz(roomCode);
    socket.emit("quizEnded", roomCode);
  });

  // ── Nuke - broadcast animation to all clients ───────────────────────────
  socket.on("nuke", (password) => {
    // Optional: Add password protection
    const NUKE_PASSWORD = "BOOM"; // Change this to whatever you want

    if (password === NUKE_PASSWORD) {
      console.log("💥 NUKE ACTIVATED by", socket.id);
      io.emit("triggerNuke"); // Broadcast to ALL connected clients
    } else {
      socket.emit("error", { message: "Invalid nuke password" });
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
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

        if (room.players.size === 0) {
          rooms.delete(roomCode);
          console.log(`Room ${roomCode} deleted (empty)`);
        }
      }
    }
  });
}); // ── end of io.on("connection") ─────────────────────────────────────────────

// Routes
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

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
      break;

    case "":
      // Just pressed enter, do nothing
      break;

    default:
      console.log(`❌ Unknown command: "${command}"`);
      console.log('Type "help" for available commands\n');
      break;
  }
});
