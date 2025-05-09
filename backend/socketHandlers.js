// --- backend/socketHandlers.js ---
/**
 * ==============================================================================
 * FILE: socketHandlers.js
 *
 * DESCRIPTION:
 * Manages Socket.IO connections and event handling. Handles player joining
 * ('joinGame' for regular, temp, ghost modes), processes client inputs (movement,
 * boost), manages disconnections, handles admin actions received via sockets,
 * relays client-side collisions (in 'low' mode), and emits necessary updates
 * (leaderboard, notifications, map size, etc.) to clients. Sends translation keys.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Validate incoming socket data and permissions (e.g., admin actions).
 * ==============================================================================
 */

// Depends on core modules passed via the 'dependencies' object (io, config, players, etc.).

let io, config, players, accounts, sessions, getLeaderboard, saveAccounts, gameMode, checkFoodSpawning, initialMapWidth, initialMapHeight;
const GameLogic = require('./gameLogic');
// Import specific spawn functions
const { findSafeSpawnLocation, getRandomSpawnLocation } = GameLogic;

const notificationCooldown = 10 * 1000;
const lastNotificationTimes = {};

/**
 * Initializes the Socket.IO handling module.
 * @param {object} deps - Object containing dependencies (io, config, players, etc.).
 */
function init(deps) {
  io = deps.io; config = deps.config; players = deps.players; accounts = deps.accounts;
  sessions = deps.sessions; getLeaderboard = deps.getLeaderboard; saveAccounts = deps.saveAccounts;
  gameMode = deps.gameMode; checkFoodSpawning = deps.checkFoodSpawning;
  initialMapWidth = deps.initialMapWidth; initialMapHeight = deps.initialMapHeight;
  setupSocketListeners();
  console.log("SocketHandlers initialized.");
}

/** Sets up listeners for new Socket.IO connections. */
function setupSocketListeners() {
  io.on("connection", (socket) => {
    console.log("Player connected (socket):", socket.id);
    let authenticatedUsername = null;
    let playerUsername = null; // Username used for this specific game session
    let isAdmin = false;

    // --- Attempt Authentication via Cookie ---
    try {
      const cookieHeader = socket.request.headers.cookie;
      if (cookieHeader) {
        const cookies = cookieHeader.split(";").reduce((res, c) => {
          const [key, val] = c.trim().split("=").map(decodeURIComponent);
          try { return Object.assign(res, { [key]: val }); } catch (e) { return res; }
        }, {});
        const initialToken = cookies?.sessionToken;
        if (initialToken && sessions[initialToken] && sessions[initialToken].expires > Date.now()) {
          const username = sessions[initialToken].username;
          if (accounts[username] && !accounts[username].isSuspended) {
            authenticatedUsername = username;
            socket.username = authenticatedUsername; // Store username on socket
            isAdmin = accounts[username].isAdmin || false;
            socket.isAdmin = isAdmin; // Store admin status on socket
            console.log(`Socket ${socket.id} authenticated via cookie: ${authenticatedUsername} (Admin: ${isAdmin})`);
          } else console.log(`Session cookie found for ${username} but account missing or suspended.`);
        }
      }
    } catch (e) { console.error("Error reading initial socket cookie:", e); }

    // --- Handle Player Joining Game ---
    socket.on("joinGame", (data) => {
      let displayName, isTemporary, headColor, bodyColor, skinData;
      let joinAsGhost = data.mode === "ghost";

      // --- Determine Player Identity and Data ---
      if (socket.username) { // Authenticated user joining
        displayName = socket.username; isTemporary = false;
        const account = accounts[displayName];
        if (!account) { socket.emit("loginFailed", { messageKey: "socket.loginFailed.accountError" }); socket.disconnect(true); return; }
        if (account.isSuspended) { socket.emit("loginFailed", { messageKey: "socket.loginFailed.suspended" }); socket.disconnect(true); return; }
        if (joinAsGhost && !socket.isAdmin) { console.warn(`Non-admin user ${displayName} attempted to join as ghost.`); joinAsGhost = false; }
        headColor = account.headColor || "#ff0000";
        bodyColor = account.bodyColor || "#ffff00"; // Base body color
        // Load or default skin data
        if (account.skinData && typeof account.skinData === 'object' && account.skinData.bodyType) {
            skinData = JSON.parse(JSON.stringify(account.skinData)); // Deep copy
            if (skinData.bodyType === "single") skinData.bodyColor = bodyColor; // Ensure single color type uses the main bodyColor
        } else {
            console.warn(`Account ${displayName} missing valid skinData, creating default.`);
            skinData = { bodyType: "single", bodyColor: bodyColor, patternColors: [], trailEffect: "none" };
        }
        console.log(`Authenticated player ${displayName} joining via ${socket.id} (Ghost: ${joinAsGhost}).`);
      } else { // Guest player joining
        displayName = `Slither${Math.floor(100000 + Math.random() * 900000)}`;
        isTemporary = true; joinAsGhost = false; // Guests cannot be ghosts
        console.log(`Temporary player ${displayName} joining via ${socket.id}.`);
        headColor = data.headColor || "#ff0000";
        bodyColor = data.bodyColor || "#ffff00"; // Base body color from client
        skinData = data.skinData; // Skin data from client
        // Validate and default guest skin data
        if (skinData && typeof skinData === 'object' && skinData.bodyType) {
            skinData.bodyType = skinData.bodyType || "single";
            skinData.bodyColor = skinData.bodyColor || bodyColor; // Use client color if single
            skinData.patternColors = skinData.patternColors || [];
            skinData.trailEffect = skinData.trailEffect || "none";
            if (skinData.bodyType === "single") skinData.bodyColor = bodyColor; // Ensure single color type uses the main bodyColor
        } else skinData = { bodyType: "single", bodyColor: bodyColor, patternColors: [], trailEffect: "none" };
        // Create temporary account entry (will be deleted on disconnect)
        if (!accounts[displayName]) {
          accounts[displayName] = {
            password: "", headColor, bodyColor, skinData, created: Date.now(), lastLogin: Date.now(),
            totalSize: 0, totalKills: 0, totalDeaths: 0, isTemporary: true, isAdmin: false, isSuspended: false,
          };
        }
      }
      playerUsername = displayName; // Store username for this session

      // --- Check if Account Already Connected (Non-Ghost) ---
      if (!isTemporary && !joinAsGhost) {
        for (let id in players) {
          if (id !== socket.id && players[id].name === displayName && !players[id].isTemporary && !players[id].isGhost) {
            socket.emit("loginFailed", { messageKey: "socket.loginFailed.alreadyConnected" });
            socket.disconnect(true); return;
          }
        }
      }

      // --- Determine Spawn Location (Smart with Fallback) ---
      let spawnLocation = null;
      const MAX_SPAWN_ATTEMPTS = 5;
      for (let attempt = 1; attempt <= MAX_SPAWN_ATTEMPTS; attempt++) {
          console.log(`Spawn attempt ${attempt}/${MAX_SPAWN_ATTEMPTS} for ${displayName}...`);
          spawnLocation = findSafeSpawnLocation(); // Attempt smart spawn
          if (spawnLocation) break; // Found a good spot
          else {
              console.warn(`Smart spawn failed (attempt ${attempt}), trying random fallback...`);
              spawnLocation = getRandomSpawnLocation(); // Use random as fallback
              if (spawnLocation) break; // Use the random location
              else {
                  console.error(`CRITICAL: Both smart and random spawn failed (attempt ${attempt})!`);
                  if (attempt === MAX_SPAWN_ATTEMPTS) {
                      console.error("Max spawn attempts reached. Spawning at map center.");
                      spawnLocation = { x: initialMapWidth / 2, y: initialMapHeight / 2 };
                  }
              }
          }
      }
      if (!spawnLocation) { console.error("FATAL: Could not determine any spawn location!"); socket.disconnect(true); return; }
      const startX = spawnLocation.x; const startY = spawnLocation.y;
      // --- End Spawn Location Logic ---

      // --- Create Player Object ---
      players[socket.id] = {
        id: socket.id, name: displayName, headColor, bodyColor, skinData, // Store determined colors/skin
        x: startX, y: startY, angle: Math.random() * 2 * Math.PI, mouseX: startX, mouseY: startY, // Initial mouse position
        trail: joinAsGhost ? [] : [{ x: startX, y: startY }], // Initial trail segment
        spawnTime: Date.now(), hasCollided: false, collisionData: null, boost: false, boostTick: 0,
        maxTrailLength: joinAsGhost ? 0 : config.INITIAL_SIZE, killCount: 0, cheatStart: null,
        // Apply god mode only if enabled in config and not a ghost
        godmode: !joinAsGhost && config.GODMODE_ON_SPAWN_ENABLED,
        godmodeStartTime: (!joinAsGhost && config.GODMODE_ON_SPAWN_ENABLED) ? Date.now() : 0,
        isTemporary, isAdmin: socket.isAdmin || false, // Use stored admin status
        isGhost: joinAsGhost, isFrozen: false, lastMouseMove: Date.now(), type: "player", // Mark as human player
        lastPosition: { x: startX, y: startY, time: Date.now() }, // For anti-cheat
        teleportViolations: 0, isPanning: false, panStartX: 0, panStartY: 0, // For ghost panning
        panStartCameraX: startX, panStartCameraY: startY, cameraX: startX, cameraY: startY, // Initial camera for ghost
        particles: [], // Initialize particle array
      };
      const playerInfo = players[socket.id];
      let effectivePlayerSecurity = config.SECURITY_MODE;
      if (config.SECURITY_MODE === 'medium' && playerInfo.isAdmin && !playerInfo.isGhost) {
        effectivePlayerSecurity = 'low (admin)'; // Admins effectively operate as 'low' in 'medium' mode for collisions
      } else if (playerInfo.isGhost) {
        effectivePlayerSecurity = 'N/A (ghost)';
      }
      console.log(
        `Player ${playerInfo.name} (${socket.id}) initialized. ` +
        `Admin: ${playerInfo.isAdmin}, Ghost: ${playerInfo.isGhost}, Temp: ${playerInfo.isTemporary}. ` +
        `GlobalMode: ${config.SECURITY_MODE}, PlayerEffectiveMode: ${effectivePlayerSecurity}. ` +
        `Pos: (${startX.toFixed(1)}, ${startY.toFixed(1)})`
      );

      // --- Send Initial Data to Client ---
      const mapRadius = config.MAP_SHAPE === "circle" ? Math.min(initialMapWidth, initialMapHeight) / 2 : 0;
      socket.emit("mapSizeUpdate", {
        collisionRadius: config.COLLISION_RADIUS, width: initialMapWidth, height: initialMapHeight,
        shape: config.MAP_SHAPE, radius: mapRadius, mode: gameMode, zoom: config.DEFAULT_ZOOM_LEVEL,
        isGhost: joinAsGhost,
      });
      socket.emit("leaderboard", getLeaderboard()); // Send initial leaderboard

      // --- Notify Other Players ---
      const now = Date.now();
      if (!isTemporary && !joinAsGhost && (!lastNotificationTimes[playerUsername] || now - lastNotificationTimes[playerUsername] > notificationCooldown)) {
        socket.broadcast.emit("userConnected", { messageKey: "socket.userConnected", messageOptions: { username: playerUsername } });
        lastNotificationTimes[playerUsername] = now;
      }
      if (!joinAsGhost) io.emit("leaderboard", getLeaderboard()); // Update leaderboard for everyone

      // --- Ensure Food Spawning is Active ---
      if (typeof checkFoodSpawning === "function") checkFoodSpawning();
    }); // End 'joinGame' handler

    // --- Ghost Mode Panning Handlers ---
    socket.on("startPan", (data) => {
      const p = players[socket.id];
      if (p && p.isGhost && typeof data.x === "number" && typeof data.y === "number") {
        p.isPanning = true; p.panStartX = data.x; p.panStartY = data.y;
        p.panStartCameraX = p.cameraX; p.panStartCameraY = p.cameraY;
      }
    });
    socket.on("doPan", (data) => { /* Server validation if needed */ });
    socket.on("endPan", () => { const p = players[socket.id]; if (p && p.isGhost) p.isPanning = false; });

    // --- Player Input Handlers ---
    socket.on("mouse_move", (data) => {
      const p = players[socket.id];
      if (!p || p.isGhost || typeof data.x !== "number" || typeof data.y !== "number") return;
      p.mouseX = Math.max(0, Math.min(initialMapWidth, data.x)); // Clamp mouse coordinates
      p.mouseY = Math.max(0, Math.min(initialMapHeight, data.y));
      p.lastMouseMove = Date.now();
    });
    socket.on("boost", (data) => {
      const p = players[socket.id];
      if (!p || p.isGhost) return;
      p.boost = data.boost === true && p.maxTrailLength >= config.MIN_BOOST_SIZE; // Check size server-side
    });

    // --- Admin Cheat/Test Handler ---
    socket.on("secretGrow", () => { const p = players[socket.id]; if (p && !p.isGhost && socket.isAdmin) p.maxTrailLength += 10; });

    // --- Admin Action Handler ---
    socket.on("adminAction", (data) => {
      if (!socket.isAdmin) { // Check admin status from socket
        console.warn(`Socket ${socket.id} (non-admin) attempted admin action.`);
        socket.emit("adminActionFeedback", { success: false, messageKey: "socket.adminFeedback.unauthorized" }); return;
      }
      const { targetPlayerId, action } = data;
      const adminUsername = socket.username || "Unknown Admin"; // Use stored username
      const targetPlayer = players[targetPlayerId];
      if (!targetPlayer) {
        console.warn(`Admin ${adminUsername} tried to action non-existent player ${targetPlayerId}.`);
        socket.emit("adminActionFeedback", { success: false, messageKey: "socket.adminFeedback.targetNotFound" }); return;
      }
      const targetSocket = io.sockets.sockets.get(targetPlayerId);
      const targetUsername = targetPlayer.name;
      console.log(`Admin ${adminUsername} performing action '${action}' on ${targetUsername} (${targetPlayerId})`);
      let feedbackKey = ""; let feedbackOptions = { username: targetUsername, admin: adminUsername }; let success = false;

      switch (action) {
        case "kick":
          if (targetSocket) {
            targetSocket.emit("kicked", { reasonKey: "socket.kickReason", reasonOptions: { admin: adminUsername } });
            targetSocket.disconnect(true); feedbackKey = "socket.adminFeedback.kickSuccess"; success = true;
          } else {
            if (players[targetPlayerId]) {
                delete players[targetPlayerId]; if (typeof checkFoodSpawning === "function") checkFoodSpawning();
                io.emit("leaderboard", getLeaderboard()); feedbackKey = "socket.adminFeedback.kickOfflineSuccess"; success = true;
            } else { feedbackKey = "socket.adminFeedback.kickError"; success = false; }
          }
          break;
        case "ban":
          if (!targetPlayer.isTemporary && accounts[targetUsername]) {
            accounts[targetUsername].isSuspended = true; saveAccounts();
            let sessionsRemoved = 0;
            for (const token in sessions) { if (sessions[token].username === targetUsername) { delete sessions[token]; sessionsRemoved++; } }
            if (sessionsRemoved > 0) saveSessions();
            if (targetSocket) {
              targetSocket.emit("banned", { reasonKey: "socket.banReason", reasonOptions: { admin: adminUsername } });
              targetSocket.disconnect(true); feedbackKey = "socket.adminFeedback.banSuccess"; success = true;
            } else {
              if (players[targetPlayerId]) { delete players[targetPlayerId]; if (typeof checkFoodSpawning === "function") checkFoodSpawning(); io.emit("leaderboard", getLeaderboard()); }
              feedbackKey = "socket.adminFeedback.banAccountOnlySuccess"; success = true;
            }
          } else { feedbackKey = "socket.adminFeedback.banError"; success = false; }
          break;
        case "freeze":
          targetPlayer.isFrozen = !targetPlayer.isFrozen;
          feedbackKey = targetPlayer.isFrozen ? "socket.adminFeedback.freezeSuccess" : "socket.adminFeedback.unfreezeSuccess";
          success = true;
          break;
        case "kill":
          if (typeof GameLogic.handlePlayerDeath === 'function') {
              GameLogic.handlePlayerDeath(targetPlayerId, null, true, socket.id, { reasonKey: "game.deathReason.killedByAdmin", reasonOptions: { admin: adminUsername } });
              feedbackKey = "socket.adminFeedback.killSuccess"; success = true;
          } else {
              console.error("GameLogic.handlePlayerDeath not accessible from socketHandlers.");
              if (targetSocket) {
                  targetSocket.emit("gameOver", { reasonKey: "game.deathReason.killedByAdmin", reasonOptions: { admin: adminUsername }, kill: true, finalSize: targetPlayer.maxTrailLength || 0 });
                  targetSocket.disconnect(true);
              } else if (players[targetPlayerId]) { delete players[targetPlayerId]; if (typeof checkFoodSpawning === "function") checkFoodSpawning(); io.emit("leaderboard", getLeaderboard()); }
              feedbackKey = "socket.adminFeedback.killSuccess"; success = true; // Assume success even if simplified
          }
          break;
        case "clear": // Remove player without spawning food
          if (targetSocket) {
            targetSocket.emit("kicked", { reasonKey: "socket.clearReason", reasonOptions: { admin: adminUsername } });
            targetSocket.disconnect(true);
          }
          if (players[targetPlayerId]) {
            delete players[targetPlayerId]; // Just delete, no handlePlayerDeath
            if (typeof checkFoodSpawning === "function") checkFoodSpawning();
            io.emit("leaderboard", getLeaderboard()); feedbackKey = "socket.adminFeedback.clearSuccess"; success = true;
          } else { feedbackKey = "socket.adminFeedback.clearError"; success = false; }
          break;
        default:
          console.warn(`Admin ${adminUsername} sent unknown action: ${action}`);
          feedbackKey = "socket.adminFeedback.unknownAction"; success = false;
      }
      socket.emit("adminActionFeedback", { success: success, messageKey: feedbackKey, messageOptions: feedbackOptions });
    });

    // --- Client-Side Collision Handler ---
    socket.on('clientCollisionDetected', (data) => {
        const p = players[socket.id];
        if (!p || p.isGhost || p.hasCollided) return;

        let collisionTrusted = false;
        if (config.SECURITY_MODE === 'low') {
            collisionTrusted = true;
        } else if (config.SECURITY_MODE === 'medium' && p.isAdmin) {
            // In medium mode, only trust admins for client-side collision
            collisionTrusted = true;
        } else {
            console.warn(`Received clientCollisionDetected from ${socket.id} (Player: ${p.name}, Admin: ${p.isAdmin}) in mode '${config.SECURITY_MODE}'. Ignoring.`);
            return;
        }

        if (collisionTrusted) {
            console.log(`Client ${p.name} (${socket.id}) reported collision (trusted in mode '${config.SECURITY_MODE}'${p.isAdmin && config.SECURITY_MODE === 'medium' ? ' as admin' : ''}). Killer ID: ${data?.killerId}`);
            if (typeof GameLogic.handlePlayerDeath === 'function') {
                GameLogic.handlePlayerDeath(socket.id, null, true, data?.killerId, { reasonKey: "game.deathReason.clientCollision", reasonOptions: {} });
            } else {
                console.error("GameLogic.handlePlayerDeath not accessible from socketHandlers for client collision.");
            }
        }
    });

    // --- Admin Self-Freeze Handler ---
    socket.on("toggleSelfFreeze", () => {
        if (!socket.isAdmin) { console.warn(`Socket ${socket.id} (non-admin) attempted self-freeze.`); return; }
        const p = players[socket.id];
        if (p && !p.isGhost && p.type === 'player') {
            p.isFrozen = !p.isFrozen;
            console.log(`Admin ${p.name} (${socket.id}) ${p.isFrozen ? 'froze' : 'unfroze'} themselves.`);
            socket.emit("freezeStateUpdate", { isFrozen: p.isFrozen }); // Notify client of their freeze state
        } else console.warn(`Admin ${socket.username || socket.id} tried to self-freeze but player state invalid.`);
    });

    // --- Handle Player Disconnection ---
    socket.on("disconnect", (reason) => {
      console.log(`Player disconnected: ${socket.id}, Reason: ${reason}`);
      const p = players[socket.id];
      const disconnectedUsername = playerUsername || (p ? p.name : null); // Use session username
      const wasGhost = p?.isGhost || false;
      if (p) {
        if (p.isTemporary && accounts[p.name]) delete accounts[p.name]; // Remove temp account
        delete players[socket.id]; // Remove player from game state
      }
      // Notify others if a non-ghost, non-temporary player disconnected
      if (!wasGhost && disconnectedUsername && accounts[disconnectedUsername] && !accounts[disconnectedUsername].isTemporary) {
        const now = Date.now();
        if (!lastNotificationTimes[disconnectedUsername] || now - lastNotificationTimes[disconnectedUsername] > notificationCooldown) { // Throttle disconnect notifications
          io.emit("userDisconnected", { messageKey: "socket.userDisconnected", messageOptions: { username: disconnectedUsername } });
          lastNotificationTimes[disconnectedUsername] = now;
        }
      }
      if (!wasGhost) io.emit("leaderboard", getLeaderboard()); // Update leaderboard if a non-ghost player left
      if (typeof checkFoodSpawning === "function") checkFoodSpawning(); // Check if food/bot spawning needs adjustment
      // Could add checkBotSpawning() here too if needed
    });

    // Send initial leaderboard state on connection
    socket.emit("leaderboard", getLeaderboard());

  }); // End io.on('connection')
}

module.exports = { init };
