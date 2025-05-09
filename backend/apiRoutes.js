// --- backend/apiRoutes.js ---
/**
 * ==============================================================================
 * FILE: apiRoutes.js
 *
 * DESCRIPTION:
 * Manages all Express API routes for the Slither Clone SIO server, including
 * admin actions, authentication, configuration management, user management,
 * and skin updates. Handles request validation and interacts with core logic modules.
 * Sends translation keys and options to the client instead of hardcoded messages.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Implement proper request validation and error handling for all routes.
 * ==============================================================================
 */

// Depends on Express and core modules passed via the 'dependencies' object.

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

// Constants moved or passed via dependencies
const MAX_USERNAME_LENGTH = 15;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCOUNT_CREATION_LIMIT = 5; // Max accounts per IP per hour
const ACCOUNT_CREATION_TIMEFRAME = 60 * 60 * 1000; // 1 hour in ms
const PRUNE_INACTIVITY_DAYS = 15;
const PRUNE_MIN_KILLS = 1; // Keep accounts with at least this many kills
const PRUNE_MIN_DEATHS = 2; // Keep accounts with at least this many deaths
const BCRYPT_SALT_ROUNDS = 10; // Make sure this matches server.js if needed elsewhere

function createApiRouter(dependencies) {
  const {
    config, accounts, sessions, saveAccounts, saveSessions, saveConfig,
    players, io, GameLogic, getLeaderboard, ipRateLimit, authenticateUser,
    requireAdmin,
  } = dependencies;

  const router = express.Router();

  // --- Helper Functions (Specific to Routes) ---

  function getUsersToPrune() {
    const now = Date.now();
    const cutoffDate = now - PRUNE_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
    const usersToDelete = [];
    for (const username in accounts) {
      const account = accounts[username];
      if (account.isTemporary || account.isAdmin || account.isSuspended) continue;
      const lastLogin = account.lastLogin || account.created;
      const kills = account.totalKills || 0;
      const deaths = account.totalDeaths || 0;
      if (lastLogin < cutoffDate && kills < PRUNE_MIN_KILLS && deaths < PRUNE_MIN_DEATHS) {
        usersToDelete.push(username);
      }
    }
    return usersToDelete;
  }

  // --- Admin Routes ---
  router.get("/admin", requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public/admin.html"));
  });

  router.get("/admin/settings", requireAdmin, (req, res) => {
    try {
      const settingsToSend = {
        MAP_WIDTH: config.MAP_WIDTH, MAP_HEIGHT: config.MAP_HEIGHT, MAP_SHAPE: config.MAP_SHAPE,
        MAX_TRAIL_LENGTH_DEFAULT: config.MAX_TRAIL_LENGTH_DEFAULT, INITIAL_SIZE: config.INITIAL_SIZE,
        MIN_BOOST_SIZE: config.MIN_BOOST_SIZE, SPEED: config.SPEED, MAX_ROTATION_RATE: config.MAX_ROTATION_RATE,
        BOOST_CONSUMPTION_RATE: config.BOOST_CONSUMPTION_RATE, FOOD_SPAWN_INTERVAL: config.FOOD_SPAWN_INTERVAL,
        FPS: config.FPS, FOOD_ATTRACTION_STRENGTH: config.FOOD_ATTRACTION_STRENGTH,
        FOOD_SNAP_DISTANCE: config.FOOD_SNAP_DISTANCE, TELEPORT_VIOLATION_THRESHOLD: config.TELEPORT_VIOLATION_THRESHOLD,
        TELEPORT_TOLERANCE_FACTOR: config.TELEPORT_TOLERANCE_FACTOR, DEFAULT_ZOOM_LEVEL: config.DEFAULT_ZOOM_LEVEL,
        BOTS_ENABLED: config.BOTS_ENABLED, BOT_SPAWN_INTERVAL_MS: config.BOT_SPAWN_INTERVAL_MS,
        BOT_MAX_COUNT: config.BOT_MAX_COUNT, BOT_EXPIRATION_TIME_MS: config.BOT_EXPIRATION_TIME_MS,
        BOT_DIFFICULTY: config.BOT_DIFFICULTY, SECURITY_MODE: config.SECURITY_MODE, AOI_RADIUS: config.AOI_RADIUS,
        GODMODE_ON_SPAWN_ENABLED: config.GODMODE_ON_SPAWN_ENABLED,
      };
      res.json({ success: true, config: settingsToSend });
    } catch (error) {
      console.error("Error retrieving admin settings:", error);
      res.status(500).json({ success: false, messageKey: "api.errors.internalServerError" }); // Use key
    }
  });

  router.post("/admin/update", requireAdmin, (req, res) => {
    let configChanged = false;
    let restartRequired = false;
    let changes = {};
    const keysToUpdate = [
      "mapWidth", "mapHeight", "mapShape", "maxTrailLengthDefault", "initialSize", "minBoostSize",
      "speed", "maxRotationRate", "boostConsumptionRate", "foodSpawnInterval", "fps",
      "foodAttractionStrength", "foodSnapDistance", "teleportViolationThreshold", "teleportToleranceFactor",
      "defaultZoomLevel", "botsEnabled", "botSpawnIntervalMs", "botMaxCount", "botExpirationTimeMs",
      "botDifficulty", "securityMode", "aoiRadius",
    ];
    keysToUpdate.push("godmodeOnSpawnEnabled");

    keysToUpdate.forEach((key) => {
      const configKey = key.replace(/([A-Z])/g, "_$1").replace(/([0-9]+)/g, "_$1").toUpperCase();
      if (req.body[key] !== undefined && req.body[key] !== "" && config.hasOwnProperty(configKey)) {
        const originalValue = config[configKey];
        const submittedHttpValue = req.body[key];
        let convertedFormValue;

        try { // Encapsulate conversion and comparison in a try...catch
            // --- Type Conversion ---
            if (typeof originalValue === 'boolean') {
              if (typeof submittedHttpValue === 'boolean') {
                convertedFormValue = submittedHttpValue;
              } else {
                convertedFormValue = submittedHttpValue === 'true'; // String to boolean conversion
              }
            } else if (typeof originalValue === 'number') {
              const num = Number(submittedHttpValue);
              if (!isNaN(num)) {
                convertedFormValue = num; // String/boolean to number conversion
              } else {
                // If conversion fails, log and skip to the next key
                console.warn(`Admin: Invalid number format for ${configKey}: '${submittedHttpValue}'. Skipping update for this key.`);
                return; // 'return' exits the current iteration of forEach
              }
            } else if (typeof originalValue === 'string') {
              convertedFormValue = String(submittedHttpValue); // Conversion to string
            } else {
              // Handle the case where the key exists but has an unexpected type (null, object, etc.)
              console.warn(`Admin: Unsupported original type for ${configKey} ('${typeof originalValue}'). Skipping update for this key.`);
              return; // Exit current iteration
            }

            // --- Specific Validations after Conversion ---
            if (configKey === "SECURITY_MODE" && !["high", "low"].includes(convertedFormValue)) { console.warn(`Admin: Invalid value for SECURITY_MODE: '${convertedFormValue}'. Must be 'high' or 'low'.`); return; }
            if (configKey === "BOT_DIFFICULTY" && !["easy", "medium", "hard"].includes(convertedFormValue)) { console.warn(`Admin: Invalid value for BOT_DIFFICULTY: '${convertedFormValue}'. Must be 'easy', 'medium', or 'hard'.`); return; }
            if (configKey === "MAP_SHAPE" && !["rectangle", "circle"].includes(convertedFormValue)) { console.warn(`Admin: Invalid value for MAP_SHAPE: '${convertedFormValue}'. Must be 'rectangle' or 'circle'.`); return; }

            // --- Comparison and Update ---
            // Compare the original value with the converted form value
            if (originalValue !== convertedFormValue) {
              config[configKey] = convertedFormValue;
              changes[configKey] = { old: originalValue, new: convertedFormValue };
              configChanged = true;
              console.log(`Admin Update ${configKey} = ${convertedFormValue}`);

              // Restart/update logic
              if (["MAP_WIDTH", "MAP_HEIGHT", "MAP_SHAPE", "SECURITY_MODE", "AOI_RADIUS"].includes(configKey)) restartRequired = true;
              if (configKey === "FPS" && !restartRequired) {
                if (typeof GameLogic !== 'undefined' && GameLogic.stopGameLoop && GameLogic.startGameLoop) {
                    GameLogic.stopGameLoop(); GameLogic.startGameLoop();
                } else { console.warn("GameLogic methods not available for FPS update."); }
              }
              if (configKey === "DEFAULT_ZOOM_LEVEL") { io.emit("configUpdate", { zoomLevel: convertedFormValue }); console.log("Zoom level updated, notifying clients."); }
              if (configKey.startsWith("BOT_") && typeof GameLogic !== 'undefined' && typeof GameLogic.updateBotSettings === 'function') {
                 GameLogic.updateBotSettings();
              }
            }
        } catch (error) {
            // Catch any unexpected errors during processing of this key
            console.error(`Admin: Error processing key ${key} (${configKey}) with value '${submittedHttpValue}':`, error);
            // Continue with other keys by exiting this iteration
            return; // Exit current iteration
        }

      } else if (req.body[key] === undefined) {
          // Expected key but not received (e.g., empty field not submitted?) - Silently ignored for now
      } else if (!config.hasOwnProperty(configKey)) {
          // Received key but does not exist in current config - Ignored with a warning
          console.warn(`Admin: Received key ${key} (maps to ${configKey}) which does not exist in current config. Skipping.`);
      }
    });

    if (req.body.adminMessageText !== undefined) {
      const oldMessage = dependencies.adminMessage.text;
      const newMessage = req.body.adminMessageText || "";
      const newDuration = parseInt(req.body.adminMessageDuration || "10") * 1000;
      if (oldMessage !== newMessage || (newMessage && dependencies.adminMessage.duration !== newDuration)) {
        dependencies.adminMessage.text = newMessage;
        dependencies.adminMessage.duration = newDuration;
        dependencies.adminMessage.startTime = newMessage ? Date.now() : 0;
        io.emit("adminMessage", { text: dependencies.adminMessage.text });
        changes["ADMIN_MESSAGE"] = { old: oldMessage, new: newMessage };
        configChanged = true;
        console.log(`Admin message: "${dependencies.adminMessage.text}" (Duration: ${newDuration}ms)`);
      }
    }

    if (configChanged) saveConfig();

    // Send keys for feedback messages
    let messageKey = configChanged ? "feedback.settingsUpdated" : "feedback.noChanges";
    let messageOptions = {};
    if (restartRequired) messageKey = "feedback.settingsUpdatedWithRestart"; // New key needed
    else if (changes["FPS"]) messageKey = "feedback.settingsUpdatedFpsRestart"; // New key needed

    res.json({ success: true, messageKey: messageKey, messageOptions: messageOptions, changes: changes, restartRequired: restartRequired });
  });

  // --- Admin User Management Routes ---
  router.get("/admin/users", requireAdmin, (req, res) => {
    const userList = Object.entries(accounts)
      .filter(([username, data]) => !data.isTemporary)
      .map(([username, data]) => ({
        username: username, isAdmin: data.isAdmin || false, isSuspended: data.isSuspended || false,
        lastLogin: data.lastLogin || null, created: data.created || null, totalSize: data.totalSize || 0,
        totalKills: data.totalKills || 0, totalDeaths: data.totalDeaths || 0,
      }));
    res.json({ success: true, users: userList });
  });

  router.post("/admin/users/:username/setAdmin", requireAdmin, (req, res) => {
    const targetUsername = req.params.username;
    const { isAdmin } = req.body;
    if (typeof isAdmin !== "boolean") return res.status(400).json({ success: false, messageKey: "api.errors.invalidAdminStatus" }); // Use key
    if (!accounts[targetUsername] || accounts[targetUsername].isTemporary) return res.status(404).json({ success: false, messageKey: "api.errors.userNotFound" }); // Use key

    accounts[targetUsername].isAdmin = isAdmin;
    saveAccounts();
    console.log(`Admin: Admin status of ${targetUsername} updated to ${isAdmin} by ${req.user.username}`);
    res.json({ success: true, messageKey: "api.admin.adminStatusUpdated", messageOptions: { username: targetUsername } }); // Use key
  });

  router.post("/admin/users/:username/setSuspended", requireAdmin, (req, res) => {
    const targetUsername = req.params.username;
    const { isSuspended } = req.body;
    if (typeof isSuspended !== "boolean") return res.status(400).json({ success: false, messageKey: "api.errors.invalidSuspendStatus" }); // Use key
    if (!accounts[targetUsername] || accounts[targetUsername].isTemporary) return res.status(404).json({ success: false, messageKey: "api.errors.userNotFound" }); // Use key

    accounts[targetUsername].isSuspended = isSuspended;
    saveAccounts();

    if (isSuspended) {
      let sessionsRemoved = 0;
      for (const token in sessions) {
        if (sessions[token].username === targetUsername) {
          delete sessions[token];
          sessionsRemoved++;
        }
      }
      if (sessionsRemoved > 0) { saveSessions(); console.log(`Admin: ${sessionsRemoved} active session(s) invalidated for ${targetUsername} (suspended).`); }
      for (const socketId in players) {
        if (players[socketId].name === targetUsername) {
          // Send key to client
          io.to(socketId).emit("loginFailed", { messageKey: "socket.loginFailed.suspended" });
          io.sockets.sockets.get(socketId)?.disconnect(true);
          console.log(`Admin: Player ${targetUsername} disconnected (suspended).`);
          break;
        }
      }
    }
    console.log(`Admin: Suspension status of ${targetUsername} updated to ${isSuspended} by ${req.user.username}`);
    res.json({ success: true, messageKey: "api.admin.suspendStatusUpdated", messageOptions: { username: targetUsername } }); // Use key
  });

  router.delete("/admin/users/:username", requireAdmin, (req, res) => {
    const targetUsername = req.params.username;
    if (!accounts[targetUsername] || accounts[targetUsername].isTemporary) return res.status(404).json({ success: false, messageKey: "api.errors.userNotFound" }); // Use key
    if (req.user.username === targetUsername) return res.status(403).json({ success: false, messageKey: "api.errors.cannotDeleteSelf" }); // Use key

    let sessionsRemoved = 0;
    for (const token in sessions) {
      if (sessions[token].username === targetUsername) {
        delete sessions[token];
        sessionsRemoved++;
      }
    }
    if (sessionsRemoved > 0) saveSessions();

    for (const socketId in players) {
      if (players[socketId].name === targetUsername) {
        // Send key to client
        io.to(socketId).emit("loginFailed", { messageKey: "socket.loginFailed.deletedByAdmin" });
        io.sockets.sockets.get(socketId)?.disconnect(true);
        console.log(`Admin: Player ${targetUsername} disconnected (deleted).`);
        break;
      }
    }
    delete accounts[targetUsername];
    saveAccounts();
    console.log(`Admin: Account ${targetUsername} deleted by ${req.user.username}`);
    res.json({ success: true, messageKey: "api.admin.userDeleted", messageOptions: { username: targetUsername } }); // Use key
  });

  router.get("/admin/users/prune/preview", requireAdmin, (req, res) => {
    try {
      const usersToDelete = getUsersToPrune();
      res.json({ success: true, count: usersToDelete.length });
    } catch (error) {
      console.error("Error during prune preview:", error);
      res.status(500).json({ success: false, messageKey: "api.errors.prunePreviewError" }); // Use key
    }
  });

  router.delete("/admin/users/prune", requireAdmin, (req, res) => {
    let prunedCount = 0;
    let sessionsRemovedCount = 0;
    try {
      const usersToDelete = getUsersToPrune();
      if (usersToDelete.length === 0) return res.json({ success: true, messageKey: "api.admin.pruneNoUsers", prunedCount: 0 }); // Use key

      usersToDelete.forEach((username) => {
        for (const token in sessions) {
          if (sessions[token].username === username) {
            delete sessions[token];
            sessionsRemovedCount++;
          }
        }
        delete accounts[username];
        prunedCount++;
        console.log(`Admin Prune: Inactive account ${username} deleted.`);
      });

      saveAccounts();
      if (sessionsRemovedCount > 0) saveSessions();
      res.json({ success: true, messageKey: "api.admin.pruneSuccess", messageOptions: { count: prunedCount }, prunedCount: prunedCount }); // Use key
    } catch (error) {
      console.error("Error during account pruning:", error);
      res.status(500).json({ success: false, messageKey: "api.errors.pruneError" }); // Use key
    }
  });

  // --- User Authentication Routes ---
  router.get("/check-auth", authenticateUser, (req, res) => {
    // Keep sending data, client handles display
    res.json({
      loggedIn: !!req.user, username: req.user?.username, isAdmin: req.user?.isAdmin || false,
      headColor: req.user?.headColor, bodyColor: req.user?.bodyColor, skinData: req.user?.skinData,
    });
  });

  router.post("/createAccount", async (req, res) => {
    const { username, password, headColor, bodyColor } = req.body;
    const ip = req.ip;
    const now = Date.now();
    if (!ipRateLimit[ip]) ipRateLimit[ip] = { count: 0, firstTimestamp: now };
    if (now - ipRateLimit[ip].firstTimestamp > ACCOUNT_CREATION_TIMEFRAME) ipRateLimit[ip] = { count: 0, firstTimestamp: now };
    if (ipRateLimit[ip].count >= ACCOUNT_CREATION_LIMIT) {
      const timePassed = now - ipRateLimit[ip].firstTimestamp;
      const timeLeft = ACCOUNT_CREATION_TIMEFRAME - timePassed;
      const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
      console.warn(`Rate limit exceeded for account creation from IP: ${ip}`);
      return res.status(429).json({ success: false, messageKey: "api.errors.rateLimit", messageOptions: { minutes: minutesLeft } }); // Use key
    }

    if (!username || !password) return res.status(400).json({ success: false, messageKey: "api.errors.missingCredentials" }); // Use key
    if (username.length > MAX_USERNAME_LENGTH) return res.status(400).json({ success: false, messageKey: "api.errors.usernameTooLong", messageOptions: { maxLength: MAX_USERNAME_LENGTH } }); // Use key
    if (username.length < 3) return res.status(400).json({ success: false, messageKey: "api.errors.usernameTooShort", messageOptions: { minLength: 3 } }); // Use key
    if (password.length < 4) return res.status(400).json({ success: false, messageKey: "api.errors.passwordTooShort", messageOptions: { minLength: 4 } }); // Use key

    const normalizedUsername = username.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (let existingUsername in accounts) {
      if (!accounts[existingUsername].isTemporary && existingUsername.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalizedUsername) {
        return res.status(409).json({ success: false, messageKey: "api.errors.usernameTaken" }); // Use key
      }
    }

    try {
      const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      const defaultSkinData = { bodyType: "single", bodyColor: bodyColor || "#ffff00", patternColors: [], trailEffect: "none" };
      accounts[username] = {
        password: hashedPassword, headColor: headColor || "#ff0000", bodyColor: bodyColor || "#ffff00",
        skinData: defaultSkinData, created: Date.now(), lastLogin: null, totalSize: 0, totalKills: 0,
        totalDeaths: 0, isTemporary: false, isAdmin: false, isSuspended: false,
      };
      saveAccounts();
      ipRateLimit[ip].count++;
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const expires = Date.now() + SESSION_DURATION;
      sessions[sessionToken] = { username: username, expires: expires };
      saveSessions();
      res.cookie("sessionToken", sessionToken, { httpOnly: true, maxAge: SESSION_DURATION, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
      console.log(`Account created and session created for ${username} from IP ${ip}`);
      res.json({ success: true, messageKey: "api.success.accountCreated" }); // Use key
    } catch (error) {
      console.error("Error during account creation:", error);
      res.status(500).json({ success: false, messageKey: "api.errors.internalServerError" }); // Use key
    }
  });

  router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, messageKey: "api.errors.missingCredentials" }); // Use key
    const account = accounts[username];
    if (!account || account.isTemporary) return res.status(401).json({ success: false, messageKey: "api.errors.invalidCredentials" }); // Use key
    if (account.isSuspended) {
      console.log(`Login attempt failed for ${username} (account suspended).`);
      return res.status(403).json({ success: false, messageKey: "api.errors.accountSuspended" }); // Use key
    }
    try {
      const match = await bcrypt.compare(password, account.password);
      if (match) {
        account.lastLogin = Date.now();
        saveAccounts();
        const sessionToken = crypto.randomBytes(32).toString("hex");
        const expires = Date.now() + SESSION_DURATION;
        sessions[sessionToken] = { username: username, expires: expires };
        saveSessions();
        res.cookie("sessionToken", sessionToken, { httpOnly: true, maxAge: SESSION_DURATION, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
        console.log(`Session created for ${username}`);
        res.json({ success: true, messageKey: "api.success.login" }); // Use key
      } else res.status(401).json({ success: false, messageKey: "api.errors.invalidCredentials" }); // Use key
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ success: false, messageKey: "api.errors.internalServerError" }); // Use key
    }
  });

  router.post("/logout", (req, res) => {
    const token = req.cookies.sessionToken;
    if (token && sessions[token]) {
      console.log(`Logging out ${sessions[token].username}`);
      delete sessions[token];
      saveSessions();
    }
    res.clearCookie("sessionToken");
    res.status(200).json({ success: true, messageKey: "api.success.logout" }); // Use key
  });

  // --- User Customization Routes ---
  router.post("/updateSkin", authenticateUser, (req, res) => {
    console.log("Received /updateSkin request. Body:", JSON.stringify(req.body, null, 2));
    if (!req.user) return res.status(401).json({ success: false, messageKey: "api.errors.notAuthenticated" }); // Use key
    const { headColor, skinData } = req.body;
    const username = req.user.username;

    if (!headColor || !/^#[0-9a-fA-F]{6}$/.test(headColor)) { console.error(`Validation failed for ${username}: Invalid headColor "${headColor}"`); return res.status(400).json({ success: false, messageKey: "api.errors.invalidHeadColor" }); } // Use key
    if (!skinData || typeof skinData !== 'object' || skinData === null) { console.error(`Validation failed for ${username}: skinData is missing or not an object. Received:`, skinData); return res.status(400).json({ success: false, messageKey: "api.errors.missingSkinData" }); } // Use key
    if (!['single', 'pattern'].includes(skinData.bodyType)) { console.error(`Validation failed for ${username}: Invalid bodyType "${skinData.bodyType}"`); return res.status(400).json({ success: false, messageKey: "api.errors.invalidBodyType" }); } // Use key
    if (!skinData.bodyColor || !/^#[0-9a-fA-F]{6}$/.test(skinData.bodyColor)) { console.error(`Validation failed for ${username}: Invalid bodyColor "${skinData.bodyColor}" in skinData`); return res.status(400).json({ success: false, messageKey: "api.errors.invalidBodyColor" }); } // Use key
    if (!Array.isArray(skinData.patternColors)) { console.error(`Validation failed for ${username}: patternColors is not an array. Received:`, skinData.patternColors); return res.status(400).json({ success: false, messageKey: "api.errors.invalidPatternColorsType" }); } // Use key
    if (skinData.patternColors.length > 8) { console.error(`Validation failed for ${username}: Too many patternColors (${skinData.patternColors.length})`); return res.status(400).json({ success: false, messageKey: "api.errors.tooManyPatternColors", messageOptions: { max: 8 } }); } // Use key
    if (!skinData.patternColors.every(c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) { console.error(`Validation failed for ${username}: Invalid color found in patternColors. Received:`, skinData.patternColors); return res.status(400).json({ success: false, messageKey: "api.errors.invalidPatternColorValue" }); } // Use key
    const allowedEffects = ['none', 'sparkle', 'smoke', 'fire', 'ice', 'electric', 'rainbow', 'bubbles', 'glitch', 'void', 'confetti'];
    if (!skinData.trailEffect || !allowedEffects.includes(skinData.trailEffect)) { console.error(`Validation failed for ${username}: Invalid trailEffect "${skinData.trailEffect}"`); return res.status(400).json({ success: false, messageKey: "api.errors.invalidTrailEffect" }); } // Use key

    if (accounts[username]) {
      accounts[username].headColor = headColor;
      accounts[username].skinData = skinData;
      if (skinData.bodyType === 'single') accounts[username].bodyColor = skinData.bodyColor;
      saveAccounts();
      console.log(`Appearance (skin/colors) updated for ${username}`);
      res.json({ success: true, messageKey: "api.success.skinUpdated" }); // Use key
    } else {
      console.error(`Update skin failed: Account ${username} not found after authentication.`);
      res.status(404).json({ success: false, messageKey: "api.errors.userNotFound" }); // Use key
    }
  });

  // --- Account Deletion Route ---
  router.delete("/deleteAccount", authenticateUser, (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, messageKey: "api.errors.notAuthenticated" }); // Use key
    const username = req.user.username;
    if (!accounts[username] || accounts[username].isTemporary) return res.status(404).json({ success: false, messageKey: "api.errors.userNotFound" }); // Use key
    if (accounts[username].isAdmin) return res.status(403).json({ success: false, messageKey: "api.errors.adminCannotDeleteSelf" }); // Use key

    try {
      let sessionsRemoved = 0;
      for (const token in sessions) {
        if (sessions[token].username === username) {
          delete sessions[token];
          sessionsRemoved++;
        }
      }
      if (sessionsRemoved > 0) saveSessions();

      for (const socketId in players) {
        if (players[socketId].name === username) {
          // Send key to client
          io.to(socketId).emit("loginFailed", { messageKey: "socket.loginFailed.accountDeleted" });
          io.sockets.sockets.get(socketId)?.disconnect(true);
          console.log(`Player ${username} disconnected (account deleted by self).`);
          break;
        }
      }
      delete accounts[username];
      saveAccounts();
      console.log(`Account ${username} deleted by user.`);
      res.clearCookie("sessionToken");
      res.json({ success: true, messageKey: "api.success.accountDeleted" }); // Use key
    } catch (error) {
      console.error(`Error during account deletion for ${username}:`, error);
      res.status(500).json({ success: false, messageKey: "api.errors.deleteAccountError" }); // Use key
    }
  });

  return router;
}

module.exports = createApiRouter;
