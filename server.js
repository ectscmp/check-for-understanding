import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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
//   quizData: object,
//   players: Map<socketId, {name, score, answers}>,
//   currentQuestion: number,
//   started: boolean,
//   questionStartTime: timestamp
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
  const detailedReports = results.map((player) => ({
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

  io.to(room.adminId).emit("adminReport", detailedReports);

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
      quizData: null,
      players: new Map(),
      currentQuestion: 0,
      started: false,
      questionStartTime: null,
      adminId: socket.id,
    });

    socket.join(roomCode);
    socket.roomCode = roomCode;

    console.log(`Room created: ${roomCode}`);
    callback?.({ roomCode });
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
    socket.emit("adminReport");

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
});
