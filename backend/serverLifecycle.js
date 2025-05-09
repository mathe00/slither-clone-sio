// --- backend/serverLifecycle.js ---
/**
 * ==============================================================================
 * FILE: serverLifecycle.js
 *
 * DESCRIPTION:
 * Manages the server's startup and graceful shutdown procedures. Handles lockfile
 * creation/checking/removal to prevent multiple instances, starts the HTTP server
 * and game loop (via GameLogic), and sets up signal handlers (SIGINT, SIGTERM)
 * for clean shutdown (saving data, closing connections, terminating workers).
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Ensure all resources are properly released during shutdown.
 * ==============================================================================
 */

// Depends on core modules passed via the 'dependencies' object (server, io, workers, etc.).

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const process = require("process");
const GameLogic = require('./gameLogic'); // To start/stop the game loop

let server; // HTTP server instance
let io;     // Socket.IO instance
let workers; // Array of workers
let config; // Config (for FPS at startup)
let saveSessions; // Function to save sessions
let sessionSaveIntervalId; // Interval ID for periodic session saving
let PORT;
let LOCK_FILE_PATH;

/**
 * Initializes the lifecycle module with the necessary dependencies.
 * @param {object} deps - Object containing the dependencies.
 */
function init(deps) {
    server = deps.server;
    io = deps.io;
    workers = deps.workers;
    config = deps.config;
    saveSessions = deps.saveSessions; // Get save function
    sessionSaveIntervalId = deps.sessionSaveIntervalId; // Get interval ID
    PORT = process.env.PORT || 3000; // Use environment variable or 3000
    LOCK_FILE_PATH = path.join(__dirname, "server.lock"); // Define here
    console.log("ServerLifecycle initialized.");
}

/** Creates the lock file. */
function createLockFile() {
  try {
    fs.writeFileSync(LOCK_FILE_PATH, process.pid.toString());
    console.log(`Lock file created (PID: ${process.pid})`);
  } catch (err) { console.error("Unable to create lock file:", err); process.exit(1); }
}

/** Removes the lock file. */
function removeLockFile() {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) { fs.unlinkSync(LOCK_FILE_PATH); console.log("Lock file removed."); }
  } catch (err) { console.error("Error removing lock file:", err); }
}

/** Starts the HTTP server and game loop. */
function startServerInternal() {
  // initializeWorkers() is called in server.js before module initialization
  server.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
      GameLogic.startGameLoop(); // Start the loop via the GameLogic module
    })
    .on("error", (err) => {
      removeLockFile();
      if (err.code === "EADDRINUSE") console.error(`Error: Port ${PORT} already in use.`);
      else console.error("Error starting server:", err);
      process.exit(1);
    });
}

/** Checks the lock file and starts the server. */
function checkLockFileAndStart() {
  if (fs.existsSync(LOCK_FILE_PATH)) {
    const lockPid = fs.readFileSync(LOCK_FILE_PATH, "utf8");
    console.warn(`Lock file found (PID: ${lockPid}). Another instance running?`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Kill existing process and start? (yes/no): ", (answer) => {
        rl.close();
        if (answer.toLowerCase() === "yes") {
          try {
            process.kill(parseInt(lockPid), "SIGTERM"); console.log(`SIGTERM sent to ${lockPid}.`);
            setTimeout(() => {
              try { if (fs.existsSync(LOCK_FILE_PATH)) fs.unlinkSync(LOCK_FILE_PATH); }
              catch (unlinkErr) { console.warn("Unable to remove old lock:", unlinkErr.message); }
              createLockFile(); startServerInternal();
            }, 500);
          } catch (err) {
            if (err.code === "ESRCH") {
              console.log("Process not found. Removing lock and starting.");
              try { fs.unlinkSync(LOCK_FILE_PATH); } catch (unlinkErr) { console.warn("Unable to remove lock:", unlinkErr.message); }
              createLockFile(); startServerInternal();
            } else { console.error("Error killing process:", err); process.exit(1); }
          }
        } else { console.log("Startup cancelled."); process.exit(0); }
      }
    );
  } else { createLockFile(); startServerInternal(); }
}

/** Handles graceful shutdown of the server. */
function gracefulShutdown() {
  console.log("\nGraceful shutdown...");
  if (sessionSaveIntervalId) clearInterval(sessionSaveIntervalId); // Stop periodic saving
  GameLogic.stopGameLoop(); // Stop the loop via GameLogic
  removeLockFile();
  console.log("Final session save...");
  if (typeof saveSessions === 'function') {
      saveSessions(); // Perform final session save
  } else {
      console.warn("saveSessions function not available for shutdown.");
  }
  console.log("Terminating workers...");
  Promise.all(workers.map(worker => worker.terminate())).then(() => {
      console.log("Workers terminated.");
      io.close(() => {
        console.log("Socket.IO connections closed.");
        server.close(() => { console.log("HTTP server closed."); process.exit(0); });
      });
  }).catch(err => { console.error("Error terminating workers:", err); process.exit(1); });
  setTimeout(() => { console.error("Shutdown timeout. Forcing exit."); process.exit(1); }, 5000);
}

/** Sets up listeners for SIGINT and SIGTERM. */
function setupGracefulShutdown() {
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
    console.log("Graceful shutdown handlers configured (SIGINT, SIGTERM).");
}

module.exports = {
    init,
    start: checkLockFileAndStart, // Export the function that checks the lock and starts
    setupGracefulShutdown,
    removeLockFile // Export in case it's needed elsewhere
};
