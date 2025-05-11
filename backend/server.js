// --- backend/server.js ---
/**
 * ==============================================================================
 * FILE: server.js
 *
 * DESCRIPTION:
 * Main Node.js server orchestrator for Slither Clone SIO. Initializes Express,
 * Socket.IO, middleware (including authentication), loads configuration and data,
 * sets up shared state, initializes worker pool, injects dependencies into other
 * backend modules (apiRoutes, gameLogic, socketHandlers, serverLifecycle),
 * mounts the API router, and starts the server lifecycle.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Focus on orchestration and dependency injection here.
 * ==============================================================================
 */

// --- Dependencies ---
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");
const os = require("os");
const crypto = require("crypto"); // Keep crypto if needed elsewhere, maybe sessions?
const bcrypt = require("bcrypt"); // Keep bcrypt if needed elsewhere
const cookieParser = require("cookie-parser");
const process = require("process");

// --- Local Modules ---
const GameLogic = require("./gameLogic");
const SocketHandlers = require("./socketHandlers");
const ServerLifecycle = require("./serverLifecycle");
const createApiRouter = require("./apiRoutes"); // Import the router factory

// --- Express and Socket.IO Initialization ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Constants and Configuration ---
const CONFIG_PATH = path.join(__dirname, "config.json");
const ACCOUNTS_PATH = path.join(__dirname, "accounts.json");
const SESSIONS_PATH = path.join(__dirname, "sessions.json");
const WORKER_PATH = path.join(__dirname, "collisionWorker.js");
const BCRYPT_SALT_ROUNDS = 10;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days (Keep for session logic)
const SESSION_SAVE_INTERVAL = 5 * 60 * 1000; // Save sessions every 5 minutes
const ACCOUNT_CREATION_TIMEFRAME = 60 * 60 * 1000; // Keep for rate limiting
const DEFAULT_MAP_WIDTH = 4000;
const DEFAULT_MAP_HEIGHT = 4000;
const DEFAULT_INITIAL_SIZE = 50;
const DEFAULT_MIN_BOOST_SIZE = 50;

// --- Express Middleware ---
app.set("trust proxy", 1); // Trust first proxy for req.ip
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public"))); // Serve static files
app.use(cookieParser()); // Cookie parsing middleware

// --- Content Security Policy (CSP) ---
app.use((req, res, next) => {
  // Define your CSP directives here
  const cspDirectives = [
    "default-src 'self'", "script-src 'self' https://unpkg.com",
    "script-src-elem 'self' https://unpkg.com", "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
    "connect-src 'self' ws://localhost:3000 wss://localhost:3000",
    "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'",
    "form-action 'self'",
  ];
  res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
  next();
});
// --- End CSP ---

// --- Load Configuration ---
let config = {};
let initialMapWidth = DEFAULT_MAP_WIDTH;
let initialMapHeight = DEFAULT_MAP_HEIGHT;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      console.log("Configuration loaded from config.json.");
    } else {
      console.warn("config.json not found, creating with default values.");
      config = {
        adminPasswordHash: "", MAP_WIDTH: DEFAULT_MAP_WIDTH, MAP_HEIGHT: DEFAULT_MAP_HEIGHT,
        MAP_SHAPE: "rectangle", MAX_TRAIL_LENGTH_DEFAULT: 1000, SPEED: 1,
        MAX_ROTATION_RATE: 0.08, BOOST_CONSUMPTION_RATE: 1, BOOST_CONSUMPTION_INTERVAL: 5,
        MIN_BOOST_SIZE: DEFAULT_MIN_BOOST_SIZE, INITIAL_SIZE: DEFAULT_INITIAL_SIZE,
        FOOD_SPAWN_INTERVAL: 5000, FOOD_ATTRACTION_RADIUS: 50, FOOD_ATTRACTION_STRENGTH: 0.1,
        FOOD_SNAP_DISTANCE: 5, FOOD_EXPIRATION_TIME: 10000, RANDOMIZATION_FOOD_EXPIRATION_TIME: 3000,
        FADE_OUT_DURATION: 5000, CONTROL_DELAY: 500, COLLISION_RADIUS: 8,
        SPAWN_MARGIN: 40, SAFE_COUNT: 15, CHEAT_DURATION: 5000,
        SELF_COLLISION_ENABLED: false, GODMODE_DURATION: 5000, FPS: 45,
        GRID_CELL_SIZE: 100, TELEPORT_VIOLATION_THRESHOLD: 5, TELEPORT_TOLERANCE_FACTOR: 1.5,
        DEFAULT_ZOOM_LEVEL: 1.0, BOTS_ENABLED: true, BOT_SPAWN_INTERVAL_MS: 5000,
        BOT_MAX_COUNT: 10, BOT_EXPIRATION_TIME_MS: 120000, BOT_DIFFICULTY: "easy",
        SECURITY_MODE: "medium", AOI_RADIUS: 2000, GODMODE_ON_SPAWN_ENABLED: true,
      };
      saveConfig(); // Save the default config
    }

    // Ensure types and default values
    config.MAP_WIDTH = parseInt(config.MAP_WIDTH) || DEFAULT_MAP_WIDTH;
    config.MAP_HEIGHT = parseInt(config.MAP_HEIGHT) || DEFAULT_MAP_HEIGHT;
    if (!["rectangle", "circle"].includes(config.MAP_SHAPE)) config.MAP_SHAPE = "rectangle";
    initialMapWidth = config.MAP_WIDTH;
    initialMapHeight = config.MAP_HEIGHT;
    config.FPS = parseInt(config.FPS) || 45;
    config.GRID_CELL_SIZE = parseInt(config.GRID_CELL_SIZE) || 100;
    config.INITIAL_SIZE = parseInt(config.INITIAL_SIZE) || DEFAULT_INITIAL_SIZE;
    config.MIN_BOOST_SIZE = parseInt(config.MIN_BOOST_SIZE) || DEFAULT_MIN_BOOST_SIZE;
    if (!["high", "medium", "low"].includes(config.SECURITY_MODE)) {
        console.warn(`Invalid SECURITY_MODE "${config.SECURITY_MODE}" in config, defaulting to "medium".`);
        config.SECURITY_MODE = "medium";
    }
    if (!["high", "medium", "low"].includes(config.SECURITY_MODE)) {
        console.warn(`Invalid SECURITY_MODE "${config.SECURITY_MODE}" in config, defaulting to "medium".`);
        config.SECURITY_MODE = "medium"; // Default to medium if invalid value found
    }
    config.AOI_RADIUS = parseInt(config.AOI_RADIUS) || 2000;

    if (config.GODMODE_ON_SPAWN_ENABLED === undefined) {
       config.GODMODE_ON_SPAWN_ENABLED = true; // Default to true if missing
      console.log("Missing 'GODMODE_ON_SPAWN_ENABLED' key, added with value true.");
       saveConfig(); // Save immediately if this key was added
    }
    console.log(`Initial map dimensions: ${initialMapWidth}x${initialMapHeight} (Shape: ${config.MAP_SHAPE})`);

  } catch (err) {
    console.error("Error loading/creating config.json:", err);
    config = {
      adminPasswordHash: "", MAP_WIDTH: DEFAULT_MAP_WIDTH, MAP_HEIGHT: DEFAULT_MAP_HEIGHT,
      MAP_SHAPE: "rectangle", INITIAL_SIZE: DEFAULT_INITIAL_SIZE, MIN_BOOST_SIZE: DEFAULT_MIN_BOOST_SIZE,
      DEFAULT_ZOOM_LEVEL: 1.0, SECURITY_MODE: "high", AOI_RADIUS: 2000, FPS: 45, GRID_CELL_SIZE: 100,
    };
    initialMapWidth = config.MAP_WIDTH;
    initialMapHeight = config.MAP_HEIGHT;
  }
}

function saveConfig() {
  try {
    if (!["rectangle", "circle"].includes(config.MAP_SHAPE)) {
      console.warn(`Invalid MAP_SHAPE "${config.MAP_SHAPE}" detected before saving, correcting to "rectangle".`);
      config.MAP_SHAPE = "rectangle";
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving config.json:", err);
  }
}

// --- Admin Password Management via Command Line ---
function handleAdminPasswordArg() {
  const args = process.argv.slice(2);
  const passwordArgIndex = args.indexOf("--set-new-password");

  if (passwordArgIndex !== -1 && args.length > passwordArgIndex + 1) {
    const newPassword = args[passwordArgIndex + 1];
    if (newPassword) {
      try {
        // Load accounts or initialize if not exists
        let currentAccounts = {};
        if (fs.existsSync(ACCOUNTS_PATH)) {
          currentAccounts = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf8"));
        }

        const adminUsername = "admin"; // Default admin username
        const hashedPassword = bcrypt.hashSync(newPassword, BCRYPT_SALT_ROUNDS);

        if (currentAccounts[adminUsername]) {
          // Update existing admin account
          currentAccounts[adminUsername].password = hashedPassword;
          currentAccounts[adminUsername].isAdmin = true; // Ensure isAdmin is true
          console.log(`Password for admin account "${adminUsername}" has been updated.`);
        } else {
          // Create new admin account
          currentAccounts[adminUsername] = {
            password: hashedPassword,
            headColor: "#d400ff", // Default admin head color
            bodyColor: "#00f2ff", // Default admin body color
            skinData: {
              bodyType: "pattern",
              bodyColor: "#00f2ff",
              patternColors: ["#d400ff", "#00f2ff", "#f0f0f0"],
              trailEffect: "electric"
            },
            created: Date.now(),
            lastLogin: null,
            totalSize: 0,
            totalKills: 0,
            totalDeaths: 0,
            isTemporary: false,
            isAdmin: true,
            isSuspended: false,
          };
          console.log(`Admin account "${adminUsername}" created with the new password.`);
        }

        // Save updated accounts
        fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(currentAccounts, null, 2), "utf8");
        console.log("Admin account configured and accounts.json saved.");

      } catch (error) {
        console.error("Error configuring admin account:", error);
      }
    } else {
      console.error("Please provide a password after --set-new-password.");
    }
    process.exit(0); // Exit after setting password
  }
}
handleAdminPasswordArg(); // Check for arg before full load
loadConfig(); // Load the final config

// --- Shared Global State ---
let players = {}; // Game state: { socketId: playerData }
let food = []; // Game state: [foodItem]
let accounts = {}; // { username: accountData }
let sessions = {}; // { sessionToken: sessionData }
let adminMessage = { text: "", duration: 0, startTime: 0 }; // Global admin message
let workers = []; // Worker thread pool
let workerLoad = []; // Load tracking for workers
let pendingCollisions = new Map(); // Tracks players awaiting collision results { playerId: true }
let sessionSaveIntervalId = null; // Interval ID for saving sessions
let ipRateLimit = {}; // Rate limiting for account creation { ip: { count, firstTimestamp } }

// --- Account Management ---
function loadAccounts() {
  if (fs.existsSync(ACCOUNTS_PATH)) {
    try {
      accounts = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf8"));
      let updated = false;
      for (let username in accounts) {
        if (accounts[username].isTemporary) { delete accounts[username]; updated = true; }
        else {
          if (accounts[username].isAdmin === undefined) { accounts[username].isAdmin = false; updated = true; }
          if (accounts[username].isSuspended === undefined) { accounts[username].isSuspended = false; updated = true; }
          if (accounts[username].headColor === undefined) { accounts[username].headColor = "#ff0000"; updated = true; }
          if (accounts[username].bodyColor === undefined) { accounts[username].bodyColor = "#ffff00"; updated = true; }
          if (accounts[username].skinData === undefined) { accounts[username].skinData = null; updated = true; }
        }
      }
      console.log("Accounts loaded and verified from accounts.json.");
      if (updated) { console.log("Updated accounts (missing fields/temporary)."); saveAccounts(); }
    } catch (err) {
      console.error("Error loading accounts.json:", err);
      accounts = {};
    }
  } else {
    console.log("accounts.json file not found.");
    accounts = {};
  }
}

function saveAccounts() {
  try {
    const persistentAccounts = {};
    for (const username in accounts) {
      if (!accounts[username].isTemporary) persistentAccounts[username] = accounts[username];
    }
    fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(persistentAccounts, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving accounts.json:", err);
  }
}
loadAccounts(); // Load accounts on startup

// --- Session Management ---
function loadSessions() {
  if (fs.existsSync(SESSIONS_PATH)) {
    try {
      const rawSessions = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf8"));
      const now = Date.now();
      let validCount = 0;
      let expiredCount = 0;
      sessions = {}; // Reset sessions object
      for (const token in rawSessions) {
        const session = rawSessions[token];
        if (session.expires > now) {
          const username = session.username;
          if (accounts[username] && !accounts[username].isSuspended) { sessions[token] = session; validCount++; }
          else { console.log(`Session ignored for ${username} (account deleted/suspended).`); expiredCount++; }
        } else expiredCount++;
      }
      console.log(`Sessions loaded: ${validCount} valid, ${expiredCount} invalid/expired.`);
    } catch (err) {
      console.error(`Error loading ${SESSIONS_PATH}:`, err);
      sessions = {};
    }
  } else {
    console.log(`File ${SESSIONS_PATH} not found.`);
    sessions = {};
  }
}

function saveSessions() {
  try {
    const sessionsToSave = {};
    const now = Date.now();
    for (const token in sessions) {
      const session = sessions[token];
      if (session.expires > now && accounts[session.username] && !accounts[session.username].isSuspended) {
        sessionsToSave[token] = session;
      }
    }
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessionsToSave, null, 2), "utf8");
    // console.log("Sessions saved."); // Optional: Log successful save
  } catch (err) {
    console.error(`Error saving ${SESSIONS_PATH}:`, err);
  }
}
loadSessions(); // Load sessions on startup

// Cleanup expired sessions periodically (in memory)
function cleanupExpiredSessions() {
  const now = Date.now();
  let cleanedCount = 0;
  for (const token in sessions) {
    if (sessions[token].expires < now) { delete sessions[token]; cleanedCount++; }
  }
  if (cleanedCount > 0) {
    console.log(`Cleaned ${cleanedCount} expired sessions (memory).`);
    saveSessions(); // Save after cleaning memory
  }
}
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Check every hour
sessionSaveIntervalId = setInterval(saveSessions, SESSION_SAVE_INTERVAL); // Periodic save

// --- Authentication Middleware ---
function authenticateUser(req, res, next) {
  const token = req.cookies.sessionToken;
  if (token && sessions[token]) {
    const session = sessions[token];
    const username = session.username;
    if (session.expires > Date.now() && accounts[username] && !accounts[username].isSuspended) {
      req.user = {
          username: username, isAdmin: accounts[username].isAdmin || false,
          headColor: accounts[username].headColor, bodyColor: accounts[username].bodyColor,
          skinData: accounts[username].skinData
      };
    } else {
      delete sessions[token]; // Remove invalid session
      saveSessions(); // Persist removal
      res.clearCookie("sessionToken"); // Clear client cookie
      if (accounts[username] && accounts[username].isSuspended) console.log(`Session invalidated for ${username} (account suspended).`);
    }
  }
  next(); // Continue to next middleware/route
}
app.use(authenticateUser); // Apply session check middleware globally

function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) return next(); // User is admin, proceed
  console.warn(`Admin access denied for ${req.ip} (invalid/non-admin session)`);
  if (req.accepts('html')) return res.redirect("/");
  else return res.status(403).json({ success: false, message: "Access denied." });
}
// Note: requireAdmin is now passed to apiRoutes and applied there

// --- Spatial Grid ---
class SpatialGrid {
  constructor(width, height, cellSize) {
    this.width = width; this.height = height;
    this.cellSize = cellSize > 0 ? cellSize : 100;
    this.cols = Math.ceil(width / this.cellSize);
    this.rows = Math.ceil(height / this.cellSize);
    this.grid = new Map();
  }
  _getKey(x, y) {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
    return `${col},${row}`;
  }
  _getCellCoords(x, y) {
    return {
      col: Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize))),
      row: Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize))),
    };
  }
  clear() { this.grid.clear(); }
  insert(item, x, y) {
    const key = this._getKey(x, y);
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(item);
  }
  queryNearby(x, y, radiusCells = 1) {
    const center = this._getCellCoords(x, y);
    const nearbyItems = new Set();
    const searchRadius = Math.max(1, Math.ceil(radiusCells));
    for (let r = -searchRadius; r <= searchRadius; r++) {
      for (let c = -searchRadius; c <= searchRadius; c++) {
        const qCol = center.col + c;
        const qRow = center.row + r;
        if (qCol >= 0 && qCol < this.cols && qRow >= 0 && qRow < this.rows) {
          const key = `${qCol},${qRow}`;
          if (this.grid.has(key)) this.grid.get(key).forEach(item => nearbyItems.add(item));
        }
      }
    }
    return Array.from(nearbyItems);
  }
  queryNearbyRadius(x, y, radiusPixels) {
    const nearbyItems = new Set();
    const radiusSq = radiusPixels * radiusPixels;
    const searchCellRadius = Math.ceil(radiusPixels / this.cellSize);
    const center = this._getCellCoords(x, y);
    for (let r = -searchCellRadius; r <= searchCellRadius; r++) {
      for (let c = -searchCellRadius; c <= searchCellRadius; c++) {
        const qCol = center.col + c;
        const qRow = center.row + r;
        if (qCol >= 0 && qCol < this.cols && qRow >= 0 && qRow < this.rows) {
          const key = `${qCol},${qRow}`;
          if (this.grid.has(key)) {
            this.grid.get(key).forEach((item) => {
              const dx = item.x - x; const dy = item.y - y;
              if (dx * dx + dy * dy <= radiusSq) nearbyItems.add(item);
            });
          }
        }
      }
    }
    return Array.from(nearbyItems);
  }
}
let spatialGrid = new SpatialGrid(initialMapWidth, initialMapHeight, config.GRID_CELL_SIZE);

// --- Worker Pool ---
const numCPUs = os.cpus().length > 1 ? os.cpus().length - 1 : 1;
function initializeWorkers() {
  console.log(`Initializing ${numCPUs} workers for collisions...`);
  for (let i = 0; i < numCPUs; i++) {
    const worker = new Worker(WORKER_PATH);
    worker.on("message", handleWorkerResult);
    worker.on("error", (err) => console.error(`Worker ${i} Error:`, err));
    worker.on("exit", (code) => { if (code !== 0) console.error(`Worker ${i} stopped with code ${code}`); });
    workers.push(worker);
    workerLoad.push(0);
  }
}

function dispatchToWorker(taskData) {
  if (workers.length === 0) { console.warn("No workers available for task."); return; }
  let bestWorkerIndex = 0;
  for (let i = 1; i < workers.length; i++) {
    if (workerLoad[i] < workerLoad[bestWorkerIndex]) bestWorkerIndex = i;
  }
  workers[bestWorkerIndex].postMessage(taskData);
  workerLoad[bestWorkerIndex]++;
}

function handleWorkerResult(result) {
  const { playerId, collision, error, threadId } = result;
  const workerIndex = workers.findIndex((w) => w.threadId === threadId);
  if (workerIndex !== -1 && workerLoad[workerIndex] > 0) workerLoad[workerIndex]--;
  if (error) { console.error(`Error returned by worker for ${playerId}: ${error}`); pendingCollisions.delete(playerId); return; }
  if (collision && players[playerId] && !players[playerId].hasCollided) {
    players[playerId].hasCollided = true;
    players[playerId].collisionData = collision;
  }
  pendingCollisions.delete(playerId);
}
initializeWorkers(); // Initialize the worker pool on startup

// --- Utility Functions ---
function getLeaderboard() {
  const now = Date.now();
  const onlineUsernames = new Set();
  const inGameUsernames = new Set(Object.values(players).filter(p => !p.isGhost && p.type === "player").map(p => p.name));
  for (const token in sessions) { if (sessions[token].expires > now) onlineUsernames.add(sessions[token].username); }
  return Object.keys(accounts)
    .filter(username => !accounts[username].isTemporary)
    .map(username => {
      const account = accounts[username];
      let status = "offline";
      if (inGameUsernames.has(username)) status = "ingame";
      else if (onlineUsernames.has(username)) status = "online";
      const kills = account.totalKills || 0;
      const deaths = account.totalDeaths || 0;
      const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : "N/A";
      return { username, totalSize: account.totalSize || 0, totalKills: kills, totalDeaths: deaths, kdRatio: kdRatio, status: status, lastLogin: account.lastLogin || null };
    })
    .sort((a, b) => {
      const statusOrder = { ingame: 3, online: 2, offline: 1 };
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[b.status] - statusOrder[a.status];
      return b.totalSize - a.totalSize;
    });
}

// --- Dependency Object for Modules ---
const dependencies = {
  io, server, config, players, food, accounts, sessions, adminMessage, workers,
  workerLoad, pendingCollisions, spatialGrid, saveAccounts, saveSessions,
  saveConfig, getLeaderboard, dispatchToWorker, handleWorkerResult,
  sessionSaveIntervalId, gameMode: "real", initialMapWidth, initialMapHeight,
  ipRateLimit, authenticateUser, requireAdmin, GameLogic, crypto, bcrypt,
};

// --- Module Initialization ---
GameLogic.init(dependencies);
SocketHandlers.init(dependencies);
ServerLifecycle.init(dependencies);

// --- Mount API Router ---
const apiRouter = createApiRouter(dependencies); // Create router instance with dependencies
app.use("/", apiRouter); // Mount the router at the root path

// --- Admin Account Check on Startup ---
if (!accounts["admin"]) {
  console.warn("\n************************************************************************************");
  console.warn("WARNING: No 'admin' account found.");
  console.warn("It is highly recommended to create an administrator account by running:");
  console.warn("  node backend/server.js --set-new-password YOUR_CHOSEN_PASSWORD");
  console.warn("Without an admin account, you will not be able to access the admin panel.");
  console.warn("The server will start, but admin functionalities will be unavailable.");
  console.warn("************************************************************************************\n");
} else if (accounts["admin"] && !accounts["admin"].password) {
  // This case should ideally not happen with the new setup, but as a safeguard:
  console.warn("\n************************************************************************************");
  console.warn("WARNING: The 'admin' account exists but seems to have no password set.");
  console.warn("Please ensure you have run the --set-new-password command correctly:");
  console.warn("  node backend/server.js --set-new-password YOUR_CHOSEN_PASSWORD");
  console.warn("************************************************************************************\n");
}

// --- Start Server ---
ServerLifecycle.start(); // Start the server using the lifecycle module

// --- Graceful Shutdown ---
ServerLifecycle.setupGracefulShutdown(); // Setup graceful shutdown handlers
