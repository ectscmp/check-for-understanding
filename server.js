import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";
import { configDotenv } from "dotenv";

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

// ============================================
// OWNER PANEL DATA STRUCTURES
// ============================================
let quizzes = []; // Stored quizzes for owner panel
const bannedUsers = new Set();
const serverConfig = {
  maxUsersPerRoom: 50,
  maxRooms: 100,
  roomCodePrefix: "CMP",
  requireInstructions: true,
  cookieExpiry: 48,
  enableChat: false,
};

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
import dotenv from "dotenv";

dotenv.config();

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

// ============================================
// OWNER AUTHENTICATION MIDDLEWARE
// ============================================
io.use((socket, next) => {
  const role = socket.handshake.auth.role;
  const token = socket.handshake.auth.token;

  if (role === "owner") {
    // In production, verify the token properly with JWT
    if (token && token.startsWith("owner-token-")) {
      socket.isOwner = true;
      console.log("✅ Owner authenticated:", socket.id);
      return next();
    } else {
      return next(new Error("Invalid owner credentials"));
    }
  }

  next();
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET.IO CONNECTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

io.on("connection", (socket) => {
  console.log(
    `User connected: ${socket.id} ${socket.isOwner ? "(OWNER)" : ""}`,
  );

  // ==========================================
  // OWNER PANEL HANDLERS
  // ==========================================
  if (socket.isOwner) {
    console.log("🔐 Owner connected:", socket.id);

    // ── DASHBOARD & STATISTICS ──
    socket.on("owner:getStats", () => {
      const stats = {
        activeRooms: rooms.size,
        totalUsers: io.sockets.sockets.size - 1, // Exclude owner
        totalQuizzes: quizzes.length,
        uptime: process.uptime(),
      };
      socket.emit("owner:stats", stats);
    });

    // ── ROOM MANAGEMENT ──
    socket.on("owner:getRooms", () => {
      const roomsList = Array.from(rooms.entries()).map(([code, room]) => ({
        code: code,
        name: room.roomName || "Unnamed Room",
        userCount: room.players.size,
        isActive: room.started || false,
        admin: room.adminId || "Unknown",
      }));
      socket.emit("owner:rooms", roomsList);
    });

    socket.on("owner:viewRoom", ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (room) {
        socket.emit("owner:roomDetails", {
          roomCode: room.roomCode,
          roomName: room.roomName,
          players: Array.from(room.players.values()),
          started: room.started,
          currentQuestion: room.currentQuestion,
          totalQuestions: room.quizData?.length || 0,
        });

        socket.emit("owner:activity", {
          timestamp: Date.now(),
          event: "Room Viewed",
          details: `Viewed room: ${roomCode}`,
        });
      }
    });

    socket.on("owner:pauseRoom", ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (room) {
        room.isPaused = true;
        io.to(roomCode).emit("roomPaused", {
          message: "Room has been paused by administrator",
        });

        socket.emit("owner:success", `Room ${roomCode} paused`);
        socket.emit("owner:activity", {
          timestamp: Date.now(),
          event: "Room Paused",
          details: `Paused room: ${roomCode}`,
        });
      }
    });

    socket.on("owner:closeRoom", ({ roomCode }) => {
      const room = rooms.get(roomCode);
      if (room) {
        // Notify all users in the room
        io.to(roomCode).emit("roomClosed", {
          message: "This room has been closed by the administrator",
        });

        // Remove all users from the room
        const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);
        if (socketsInRoom) {
          socketsInRoom.forEach((socketId) => {
            const userSocket = io.sockets.sockets.get(socketId);
            if (userSocket) {
              userSocket.leave(roomCode);
            }
          });
        }

        // Delete the room
        rooms.delete(roomCode);

        socket.emit("owner:success", `Room ${roomCode} closed`);
        socket.emit("owner:activity", {
          timestamp: Date.now(),
          event: "Room Closed",
          details: `Closed room: ${roomCode}`,
        });
      }
    });

    socket.on("owner:closeAllRooms", () => {
      rooms.forEach((room, roomCode) => {
        io.to(roomCode).emit("roomClosed", {
          message: "All rooms have been closed by the administrator",
        });
      });
      rooms.clear();

      socket.emit("owner:success", "All rooms closed");
      socket.emit("owner:activity", {
        timestamp: Date.now(),
        event: "Mass Action",
        details: "Closed all rooms",
      });
    });

    // ── USER MANAGEMENT ──
    socket.on("owner:getUsers", () => {
      const usersList = [];
      io.sockets.sockets.forEach((sock) => {
        if (!sock.isOwner) {
          usersList.push({
            id: sock.id,
            username: sock.username || "Anonymous",
            roomCode: sock.roomCode || null,
            isActive: sock.connected,
            connectedTime: Date.now() - (sock.connectedAt || Date.now()),
          });
        }
      });
      socket.emit("owner:users", usersList);
    });

    socket.on("owner:warnUser", ({ userId, message }) => {
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) {
        userSocket.emit("adminWarning", {
          message: message,
          timestamp: Date.now(),
        });
        socket.emit("owner:success", "Warning sent");
      }
    });

    socket.on("owner:kickUser", ({ userId }) => {
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) {
        userSocket.emit("kicked", {
          message: "You have been kicked by the administrator",
        });
        userSocket.disconnect(true);
        socket.emit("owner:success", "User kicked");
        socket.emit("owner:activity", {
          timestamp: Date.now(),
          event: "User Kicked",
          details: `Kicked user: ${userId}`,
        });
      }
    });

    socket.on("owner:banUser", ({ userId, reason }) => {
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) {
        bannedUsers.add(userSocket.handshake.address);

        userSocket.emit("banned", {
          message: "You have been banned",
          reason: reason,
        });
        userSocket.disconnect(true);

        socket.emit("owner:success", "User banned");
        socket.emit("owner:activity", {
          timestamp: Date.now(),
          event: "User Banned",
          details: `Banned user: ${userId} - ${reason}`,
        });
      }
    });

    socket.on("owner:kickAllUsers", () => {
      io.sockets.sockets.forEach((sock) => {
        if (!sock.isOwner) {
          sock.emit("kicked", {
            message: "Server maintenance - All users disconnected",
          });
          sock.disconnect(true);
        }
      });
      socket.emit("owner:success", "All users kicked");
    });

    // ── QUIZ MANAGEMENT ──
    socket.on("owner:getQuizzes", () => {
      const quizzesList = quizzes.map((quiz) => ({
        id: quiz.id,
        name: quiz.name,
        questionCount: quiz.questions?.length || 0,
        created: quiz.createdAt,
      }));
      socket.emit("owner:quizzes", quizzesList);
    });

    socket.on("owner:uploadQuiz", ({ name, data }) => {
      const newQuiz = {
        id: Date.now().toString(),
        name: name,
        questions: data.questions || data,
        createdAt: Date.now(),
      };

      quizzes.push(newQuiz);

      socket.emit("owner:success", "Quiz uploaded successfully");
      socket.emit("owner:activity", {
        timestamp: Date.now(),
        event: "Quiz Uploaded",
        details: `Uploaded quiz: ${name}`,
      });
    });

    socket.on("owner:viewQuiz", ({ quizId }) => {
      const quiz = quizzes.find((q) => q.id === quizId);
      if (quiz) {
        socket.emit("owner:quizDetails", quiz);
      }
    });

    socket.on("owner:deleteQuiz", ({ quizId }) => {
      const index = quizzes.findIndex((q) => q.id === quizId);
      if (index !== -1) {
        quizzes.splice(index, 1);
        socket.emit("owner:success", "Quiz deleted");
        socket.emit("owner:activity", {
          timestamp: Date.now(),
          event: "Quiz Deleted",
          details: `Deleted quiz: ${quizId}`,
        });
      }
    });

    socket.on("owner:deleteAllQuizzes", () => {
      quizzes.length = 0;
      socket.emit("owner:success", "All quizzes deleted");
    });

    // ── SERVER SETTINGS ──
    socket.on("owner:updateSettings", (settings) => {
      serverConfig.maxUsersPerRoom = settings.maxUsersPerRoom;
      serverConfig.maxRooms = settings.maxRooms;
      serverConfig.roomCodePrefix = settings.roomCodePrefix;
      serverConfig.requireInstructions = settings.requireInstructions;
      serverConfig.cookieExpiry = settings.cookieExpiry;
      serverConfig.enableChat = settings.enableChat;

      socket.emit("owner:success", "Settings updated");
    });

    socket.on("owner:restartServer", () => {
      socket.emit("owner:success", "Server restarting...");
      setTimeout(() => process.exit(0), 1000);
    });

    socket.on("owner:shutdownServer", () => {
      socket.emit("owner:success", "Server shutting down...");
      io.emit("serverShutdown", {
        message: "Server is shutting down for maintenance",
      });
      setTimeout(() => process.exit(0), 1000);
    });

    // ── LOGS ──
    socket.on("owner:startLogStream", () => {
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;

      console.log = function (...args) {
        originalLog.apply(console, args);
        socket.emit("owner:log", {
          type: "info",
          message: args.join(" "),
        });
      };

      console.error = function (...args) {
        originalError.apply(console, args);
        socket.emit("owner:log", {
          type: "error",
          message: args.join(" "),
        });
      };

      console.warn = function (...args) {
        originalWarn.apply(console, args);
        socket.emit("owner:log", {
          type: "warning",
          message: args.join(" "),
        });
      };

      socket.on("disconnect", () => {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
      });
    });

    socket.on("owner:stopLogStream", () => {
      // Logs stop automatically on disconnect
    });

    // ── DATABASE MANAGEMENT ──
    socket.on("owner:backupDatabase", () => {
      const backup = {
        rooms: Array.from(rooms.entries()),
        quizzes: quizzes,
        timestamp: Date.now(),
      };

      socket.emit("owner:success", `Backup created: backup-${Date.now()}.json`);
      socket.emit("owner:exportComplete", backup);
    });

    socket.on("owner:restoreDatabase", ({ data }) => {
      if (data.rooms) {
        rooms.clear();
        data.rooms.forEach(([code, room]) => rooms.set(code, room));
      }
      if (data.quizzes) {
        quizzes = data.quizzes;
      }
      socket.emit("owner:success", "Database restored");
    });

    socket.on("owner:exportData", () => {
      const exportData = {
        rooms: Array.from(rooms.entries()),
        quizzes: quizzes,
        serverConfig: serverConfig,
        exportedAt: Date.now(),
      };
      socket.emit("owner:exportComplete", exportData);
    });

    socket.on("owner:clearDatabase", () => {
      rooms.clear();
      quizzes = [];
      socket.emit("owner:success", "Database cleared");
    });

    socket.on("owner:viewCollection", ({ collectionName }) => {
      let data;
      switch (collectionName) {
        case "rooms":
          data = Array.from(rooms.entries());
          break;
        case "users":
          data = Array.from(io.sockets.sockets.values())
            .filter((s) => !s.isOwner)
            .map((s) => ({
              id: s.id,
              username: s.username,
              room: s.roomCode,
            }));
          break;
        case "quizzes":
          data = quizzes;
          break;
      }

      socket.emit("owner:collectionData", {
        collection: collectionName,
        data: data,
      });
    });

    // Owner disconnect
    socket.on("disconnect", () => {
      console.log("🔐 Owner disconnected:", socket.id);
    });

    // Don't process regular user events for owner sockets
    return;
  }

  // ==========================================
  // REGULAR USER HANDLERS
  // ==========================================

  // Track connection time for user management
  socket.connectedAt = Date.now();
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
      adminId: socket.id,
      isPublic: false,
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

    // ← REMOVED the room.started early return

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
      });
    }

    socket.emit("room_joined", roomCode);
    io.to(roomCode).emit("player_joined", {
      playerId: socket.id,
      playerCount: room.players.size,
      players: Array.from(room.players.values()),
    });

    // ← NEW: if quiz is already running, send the current question to the new joiner
    if (room.started && room.quizData) {
      const questionData = room.quizData[room.currentQuestion];
      if (questionData) {
        let options = [];
        if (questionData.choices) {
          const { correct, ...wrongs } = questionData.choices;
          options = [correct, ...Object.values(wrongs).filter(Boolean)];
        } else if (questionData.options) {
          options = questionData.options;
        }
        options = options.sort(() => Math.random() - 0.5);

        socket.emit("quizStarted", { totalQuestions: room.quizData.length });
        socket.emit("question", {
          question: questionData.question,
          options,
          questionNumber: room.currentQuestion + 1,
        });
      }
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
  socket.on("kick_user", (id) => {
    const target = io.sockets.sockets.get(id);
    console.log(id);
    if (target) {
      target.emit("kicked");
      target.disconnect(true);
    }
  });
  // ── Start quiz ──
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

  // ── Submit answer ──
  socket.on("submit_answer", ({ roomCode, answer }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const questionData = room.quizData[room.currentQuestion];
    if (!questionData) return;

    player.answers[room.currentQuestion] = answer;

    const correctAnswer =
      questionData.choices?.correct || questionData.correctAnswer;

    if (answer === correctAnswer) {
      player.score += 1;
    }

    const answeredCount = Array.from(room.players.values()).filter(
      (p) => p.answers[room.currentQuestion] !== undefined,
    ).length;
    io.to(roomCode).emit("answer_progress", {
      answered: answeredCount,
      total: room.players.size,
    });

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

      const detailedReports = generateAdminReport(room);
      io.to(room.adminId).emit("adminReport", detailedReports);

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

  // ── End quiz manually ──
  socket.on("endquiz", (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.adminId) return;

    endQuiz(roomCode);
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

        // ← FIXED: only delete if admin is also gone
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
app.get("/halliday", (req, res) => {
  res.sendFile(join(__dirname, "public", "halliday.html"));
});
app.get("/join/:roomcode", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});
app.get("/create", (req, res) => {
  res.sendFile(join(__dirname, "public", "admin.html"));
});
// ═══════════════════════════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Owner panel: http://localhost:${PORT}/halliday`);
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
