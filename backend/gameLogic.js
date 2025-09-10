// --- backend/gameLogic.js ---
/**
 * ==============================================================================
 * FILE: gameLogic.js
 *
 * DESCRIPTION:
 * Manages the main server-side game loop, entity updates (players, food, bots),
 * collision detection dispatch (to workers in 'high' mode), anti-cheat checks,
 * food spawning/expiration, bot logic, and game state synchronization via AoI.
 * Includes logic for smart player spawning with fallbacks.
 * Sends translation keys for death reasons.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Optimize the game loop for performance.
 * ==============================================================================
 */

// Depends on core modules passed via the 'dependencies' object (io, config, players, etc.).

let io;
let config;
let players;
let food;
let accounts;
let adminMessage;
let pendingCollisions;
let spatialGrid;
let dispatchToWorker;
let getLeaderboard;
let saveAccounts;
let initialMapWidth; // Map dimensions for this instance
let initialMapHeight;

let gameLoopIntervalId = null;
let lastRenderTime = 0; // Added for delta time calculation
let lastLeaderboardEmit = 0;
let cachedLeaderboard = null; // Cache for leaderboard data
let lastLeaderboardUpdate = 0; // Timestamp of last leaderboard update
let foodSpawnIntervalId = null; // Interval ID for food spawning
let botSpawnIntervalId = null; // Interval ID for bot spawning

// Variables for adaptive throttling
let lastStateEmitTime = 0;
let currentStateEmitInterval = 1000 / 45; // Default to 45 FPS
let lastPerformanceCheck = 0;
let performanceCheckInterval = 5000; // Check performance every 5 seconds
let playerCount = 0;
let avgProcessingTime = 0;
let processingTimeSamples = [];
const maxProcessingTimeSamples = 10;

// Object to track static data changes for each player
let playerStaticDataCache = {};

const ABSOLUTE_MAX_TRAIL_POINTS = 5000; // Safety limit for trail array size
const MOUSE_ACTIVITY_THRESHOLD = 200; // ms - Stop rotating if mouse hasn't moved for this long

/**
 * Checks if player's static data has changed and updates the cache.
 * @param {string} playerId - The ID of the player.
 * @param {object} playerData - The current player data.
 * @returns {boolean} True if static data has changed, false otherwise.
 */
function hasPlayerStaticDataChanged(playerId, playerData) {
  // If no cache entry exists, it's a new player (just connected)
  if (!playerStaticDataCache[playerId]) {
    playerStaticDataCache[playerId] = {
      name: playerData.name,
      headColor: playerData.headColor,
      bodyColor: playerData.bodyColor,
      skinData: JSON.stringify(playerData.skinData) // Stringify for deep comparison
    };
    return true; // New player, send all static data
  }

  // Check for changes in static data
  const cached = playerStaticDataCache[playerId];
  const currentSkinData = JSON.stringify(playerData.skinData);
  const hasChanged =
    cached.name !== playerData.name ||
    cached.headColor !== playerData.headColor ||
    cached.bodyColor !== playerData.bodyColor ||
    cached.skinData !== currentSkinData;

  // Update cache if changed
  if (hasChanged) {
    playerStaticDataCache[playerId] = {
      name: playerData.name,
      headColor: playerData.headColor,
      bodyColor: playerData.bodyColor,
      skinData: currentSkinData
    };
  }

  return hasChanged;
}

/**
 * Updates the state emit interval based on server performance and player count.
 * @param {number} processingTime - Time taken to process the last game loop iteration.
 * @param {number} now - Current timestamp.
 */
function updateStateEmitInterval(processingTime, now) {
  // If adaptive throttling is disabled, use fixed FPS from config
  if (!config.ADAPTIVE_THROTTLING_ENABLED) {
    const targetFPS = Math.max(config.MIN_FPS || 10, Math.min(config.MAX_FPS || 120, config.FPS || 45));
    currentStateEmitInterval = 1000 / targetFPS;
    return;
  }

  // Add processing time to samples
  processingTimeSamples.push(processingTime);
  if (processingTimeSamples.length > maxProcessingTimeSamples) {
    processingTimeSamples.shift();
  }

  // Calculate average processing time
  avgProcessingTime = processingTimeSamples.reduce((sum, time) => sum + time, 0) / processingTimeSamples.length;

  // Update player count
  playerCount = Object.keys(players).filter(id => players[id].type === "player" && !players[id].isGhost).length;

  // Check performance periodically
  if (now - lastPerformanceCheck > (config.PERFORMANCE_CHECK_INTERVAL || 5000)) {
    lastPerformanceCheck = now;

    // Adjust interval based on performance and player count
    const targetFPS = Math.max(config.MIN_FPS || 10, Math.min(config.MAX_FPS || 120, config.FPS || 45));
    let newInterval = 1000 / targetFPS;

    // If processing time is high, reduce FPS
    if (avgProcessingTime > 10) {
      const reductionFactor = Math.max(0.5, 1 - (avgProcessingTime - 10) / 50);
      newInterval = Math.min(1000 / (config.MIN_FPS || 10), newInterval / reductionFactor);
    }

    // If there are many players, reduce FPS slightly
    const highLoadThreshold = config.HIGH_LOAD_THRESHOLD || 50;
    if (playerCount > highLoadThreshold) {
      const playerFactor = Math.max(0.7, 1 - (playerCount - highLoadThreshold) / 100);
      const minFPS = Math.max(config.MIN_FPS || 10, targetFPS * (config.HIGH_LOAD_FPS_REDUCTION || 0.5));
      newInterval = Math.min(1000 / minFPS, newInterval / playerFactor);
    }

    // Update interval if it changed significantly
    if (Math.abs(newInterval - currentStateEmitInterval) > 1) {
      currentStateEmitInterval = newInterval;
      console.log(`Adaptive throttling: Updated state emit interval to ${currentStateEmitInterval.toFixed(2)}ms (FPS: ${(1000 / currentStateEmitInterval).toFixed(1)})`);
    }
  }
}

// --- Smart Spawn Constants ---
const NUM_SPAWN_CANDIDATES = 15; // How many random points to evaluate
const SAFE_SPAWN_RADIUS_PLAYER = 300; // Min distance (px) from other players' heads
const SAFE_SPAWN_RADIUS_BORDER = 100; // Min distance (px) from map border
const BORDER_PENALTY = -10000; // Score penalty for being too close to border
const PLAYER_PENALTY = -50000; // Score penalty for being too close to a player
const MAX_SMART_SPAWN_TIME = 50; // Max time (ms) allowed for smart spawn attempt

/**
 * Initializes the game logic module with necessary dependencies.
 * @param {object} deps - Object containing dependencies (io, config, players, etc.).
 */
function init(deps) {
  io = deps.io;
  config = deps.config; // config object is shared and updated by server.js
  players = deps.players;
  food = deps.food;
  accounts = deps.accounts;
  adminMessage = deps.adminMessage;
  pendingCollisions = deps.pendingCollisions;
  spatialGrid = deps.spatialGrid;
  dispatchToWorker = deps.dispatchToWorker;
  getLeaderboard = deps.getLeaderboard; // Function passed from server.js
  saveAccounts = deps.saveAccounts; // Function passed from server.js
  initialMapWidth = deps.initialMapWidth; // Get running map dimensions
  initialMapHeight = deps.initialMapHeight;
  console.log("GameLogic initialized.");
}

/** Generates a random spawn location respecting map shape and margins. */
function getRandomSpawnLocation() {
  let x, y;
  const margin = config.SPAWN_MARGIN;
  const mapCenterX = initialMapWidth / 2;
  const mapCenterY = initialMapHeight / 2;

  if (config.MAP_SHAPE === "circle") {
    const radius = Math.min(mapCenterX, mapCenterY) - margin;
    if (radius <= 0) { // Handle case where map is too small for margin
        console.warn("Map radius too small for spawn margin in circle mode, spawning at center.");
        return { x: mapCenterX, y: mapCenterY };
    }
    const angle = Math.random() * 2 * Math.PI;
    const dist = Math.sqrt(Math.random()) * radius; // sqrt for uniform distribution
    x = mapCenterX + dist * Math.cos(angle);
    y = mapCenterY + dist * Math.sin(angle);
  } else { // Rectangle
    const spawnWidth = initialMapWidth - 2 * margin;
    const spawnHeight = initialMapHeight - 2 * margin;
     if (spawnWidth <= 0 || spawnHeight <= 0) {
        console.warn("Map dimensions too small for spawn margin in rectangle mode, spawning at center.");
        return { x: mapCenterX, y: mapCenterY };
    }
    x = Math.random() * spawnWidth + margin;
    y = Math.random() * spawnHeight + margin;
  }
  return { x, y };
}

/** Calculates the distance from a point to the nearest map border. */
function distanceToBorder(x, y) {
    if (config.MAP_SHAPE === "circle") {
        const mapCenterX = initialMapWidth / 2;
        const mapCenterY = initialMapHeight / 2;
        const mapRadius = Math.min(mapCenterX, mapCenterY);
        const dx = x - mapCenterX;
        const dy = y - mapCenterY;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);
        return Math.max(0, mapRadius - distFromCenter);
    } else { // Rectangle
        const distLeft = x;
        const distRight = initialMapWidth - x;
        const distTop = y;
        const distBottom = initialMapHeight - y;
        return Math.min(distLeft, distRight, distTop, distBottom);
    }
}

/** Attempts to find a safe spawn location by evaluating random candidates. */
function findSafeSpawnLocation() {
    const startTime = Date.now();
    let bestCandidate = null;
    let bestScore = -Infinity;

    try {
        for (let i = 0; i < NUM_SPAWN_CANDIDATES; i++) {
            // 1. Generate Candidate
            const candidate = getRandomSpawnLocation();
            let currentScore = 0;

            // 2. Score: Distance to Border
            const distBorder = distanceToBorder(candidate.x, candidate.y);
            if (distBorder < SAFE_SPAWN_RADIUS_BORDER) {
                currentScore += BORDER_PENALTY;
                // Optional: Skip player check if too close to border already
                // continue;
            } else {
                currentScore += distBorder * 0.5; // Bonus for being far from border
            }

            // 3. Score: Distance to Players
            let tooCloseToPlayer = false;
            let minDistSqPlayer = Infinity;
            // Use a slightly larger radius for query to be safe
            const nearbyPlayers = spatialGrid.queryNearbyRadius(candidate.x, candidate.y, SAFE_SPAWN_RADIUS_PLAYER * 1.2);

            for (const entity of nearbyPlayers) {
                // Check only against other players/bots, not food or self (though self shouldn't be in grid yet)
                if (entity && (entity.type === 'player' || entity.type === 'bot') && !entity.isGhost) {
                    const dx = candidate.x - entity.x;
                    const dy = candidate.y - entity.y;
                    const distSq = dx * dx + dy * dy;
                    minDistSqPlayer = Math.min(minDistSqPlayer, distSq);

                    if (distSq < SAFE_SPAWN_RADIUS_PLAYER * SAFE_SPAWN_RADIUS_PLAYER) {
                        // Consider player size? Larger penalty for bigger snakes?
                        // const sizeFactor = Math.log10(Math.max(10, entity.maxTrailLength || 10));
                        // currentScore += PLAYER_PENALTY * (1 + sizeFactor * 0.1);
                        currentScore += PLAYER_PENALTY;
                        tooCloseToPlayer = true;
                        break; // No need to check other players for this candidate
                    }
                }
            }

            // Add bonus based on distance to *nearest* player if none were too close
            if (!tooCloseToPlayer && minDistSqPlayer !== Infinity) {
                 currentScore += Math.sqrt(minDistSqPlayer) * 1.0; // Bonus for distance
            }

            // 4. (Optional) Score: Food Density - Could be added here

            // 5. Update Best Candidate
            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestCandidate = candidate;
            }

            // Safety break if taking too long
            if (Date.now() - startTime > MAX_SMART_SPAWN_TIME) {
                console.warn(`Smart spawn exceeded time limit (${MAX_SMART_SPAWN_TIME}ms), falling back.`);
                return null; // Signal fallback
            }
        }

        // Ensure the best candidate is actually safe (didn't just get border penalty)
        if (bestCandidate && bestScore > BORDER_PENALTY / 2) { // Check score is reasonably positive
             console.log(`Smart spawn found safe location: (${bestCandidate.x.toFixed(1)}, ${bestCandidate.y.toFixed(1)}) Score: ${bestScore.toFixed(1)}`);
             return bestCandidate;
        } else {
            console.warn("Smart spawn could not find a suitably safe location, falling back.");
            return null; // Signal fallback
        }

    } catch (error) {
        console.error("Error during findSafeSpawnLocation:", error);
        return null; // Signal fallback on error
    }
}


/** Creates a new food item. */
function spawnFood(item) {
  let x, y;
  const margin = config.SPAWN_MARGIN; // Use margin for food too

  if (item.x !== undefined && item.y !== undefined) {
      x = item.x;
      y = item.y;
  } else {
      if (config.MAP_SHAPE === "circle") {
          const radius = Math.min(initialMapWidth, initialMapHeight) / 2 - margin;
          const centerX = initialMapWidth / 2;
          const centerY = initialMapHeight / 2;
          if (radius <= 0) { x = centerX; y = centerY; } // Handle small map
          else {
              const angle = Math.random() * 2 * Math.PI;
              const dist = Math.sqrt(Math.random()) * radius; // sqrt for uniform distribution
              x = centerX + dist * Math.cos(angle);
              y = centerY + dist * Math.sin(angle);
          }
      } else { // Rectangle
          const spawnWidth = initialMapWidth - 2 * margin;
          const spawnHeight = initialMapHeight - 2 * margin;
          if (spawnWidth <= 0 || spawnHeight <= 0) { x = initialMapWidth / 2; y = initialMapHeight / 2; } // Handle small map
          else {
              x = Math.random() * spawnWidth + margin;
              y = Math.random() * spawnHeight + margin;
          }
      }
  }

  const newItem = {
    id: item.id || `food-${Date.now()}-${Math.random()}`,
    x: x,
    y: y,
    size: item.size !== undefined ? item.size : Math.random() * 5 + 5,
    color: item.color || `hsl(${Math.random() * 360}, 100%, 50%)`,
    creationTime: Date.now(),
    expirationTime:
      item.expirationTime !== undefined
        ? item.expirationTime
        : Date.now() +
          config.FOOD_EXPIRATION_TIME +
          Math.random() * config.RANDOMIZATION_FOOD_EXPIRATION_TIME,
    opacity: 1,
    type: item.type || "food", // 'food' or 'boost_particle'
  };

  food.push(newItem);
}

/**
 * Handles the death of a player or bot.
 * @param {string} playerId - ID of the player/bot that died.
 * @param {string | null} reason - DEPRECATED: Use reasonKey/reasonOptions instead.
 * @param {boolean} isKill - Whether this death counts as a kill.
 * @param {string | null} killerId - ID of the killer, if any.
 * @param {object} [deathContext={}] - Object containing reasonKey and reasonOptions.
 * @param {string} deathContext.reasonKey - The i18n key for the death reason.
 * @param {object} [deathContext.reasonOptions={}] - Interpolation options for the reasonKey.
 */
function handlePlayerDeath(playerId, reason, isKill, killerId = null, deathContext = {}) {
  const p = players[playerId];
  if (!p || p.isGhost) return; // Ignore ghosts

  const { reasonKey = "game.deathReason.unknown", reasonOptions = {} } = deathContext;

  let effectivePlayerSecurityOnDeath = config.SECURITY_MODE;
  // Note: p.isGhost is already checked at the start of the function, so p here is not a ghost.
  if (config.SECURITY_MODE === 'medium' && p.isAdmin) {
    effectivePlayerSecurityOnDeath = 'low (admin)';
  }
  console.log(
    `Entity ${p.name} (${playerId}, type: ${p.type}) died. ` +
    `Admin: ${p.isAdmin}, Temp: ${p.isTemporary}. ` +
    `GlobalMode: ${config.SECURITY_MODE}, PlayerEffectiveModeAtDeath: ${effectivePlayerSecurityOnDeath}. ` +
    `Reason Key: ${reasonKey}, Kill: ${isKill}${killerId ? `, Killer: ${players[killerId]?.name || killerId}` : ''}`
  );

  // Emit gameOver only to human players, sending the key and options
  if (p.type === "player") {
    const finalSize = p.maxTrailLength || p.trail?.length || 0;
    io.to(playerId).emit("gameOver", {
      reasonKey: reasonKey,
      reasonOptions: reasonOptions,
      kill: isKill,
      finalSize: finalSize,
    });
  }

  // Spawn food from the trail
  const foodCount = Math.floor((p.trail?.length || 0) / 10);
  for (let i = 0; i < foodCount; i++) {
    const segmentIndex = Math.floor(Math.random() * (p.trail?.length || 1));
    const segment = p.trail?.[segmentIndex] || { x: p.x, y: p.y };
    spawnFood({
      x: segment.x + (Math.random() - 0.5) * 5,
      y: segment.y + (Math.random() - 0.5) * 5,
      size: Math.random() * 5 + 5,
      color: `hsl(${Math.random() * 360}, 100%, 50%)`,
      type: "food",
    });
  }

  // Update account stats only for human players
  if (p.type === "player" && accounts[p.name]) {
    accounts[p.name].totalSize =
      (accounts[p.name].totalSize || 0) + (p.maxTrailLength || 0); // Use maxTrailLength
    accounts[p.name].totalDeaths = (accounts[p.name].totalDeaths || 0) + 1;
    if (
      isKill &&
      killerId &&
      players[killerId] && // Killer exists
      !players[killerId].isGhost && // Killer is not a ghost
      players[killerId].type === "player" && // Killer is human
      accounts[players[killerId].name] // Killer has an account
    ) {
      accounts[players[killerId].name].totalKills =
        (accounts[players[killerId].name].totalKills || 0) + 1;
      io.to(killerId).emit("killConfirmed");
    }
    if (!p.isTemporary) saveAccounts();
  }

  // Remove player/bot from game state
  // Clean up static data cache
  if (playerStaticDataCache[playerId]) {
    delete playerStaticDataCache[playerId];
  }
  delete players[playerId];

  // Check if food/bot spawning needs adjustment
  checkFoodSpawning();
  checkBotSpawning(); // Check bot spawning too
}

// --- Bot Management ---
function spawnBot() {
  if (!config.BOTS_ENABLED) return;

  const botCount = Object.values(players).filter((p) => p.type === "bot").length;
  if (botCount >= config.BOT_MAX_COUNT) return;

  const botId = `bot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const botName = `Bot_${botId.slice(-4)}`;
  // Use smart spawn for bots too? For now, use random.
  const { x: startX, y: startY } = getRandomSpawnLocation();

  const headColor = `hsl(${Math.random() * 360}, 80%, 60%)`;
  const bodyColor = `hsl(${Math.random() * 360}, 70%, 50%)`;

  players[botId] = {
    id: botId,
    name: botName,
    headColor: headColor,
    bodyColor: bodyColor,
    skinData: {
      bodyType: "single",
      bodyColor: bodyColor,
      patternColors: [],
      trailEffect: "none",
    },
    x: startX,
    y: startY,
    angle: Math.random() * 2 * Math.PI,
    targetAngle: Math.random() * 2 * Math.PI,
    angleChangeTimer: 0,
    angleChangeInterval: 2000 + Math.random() * 3000,
    trail: [{ x: startX, y: startY }],
    spawnTime: Date.now(),
    expirationTime: Date.now() + config.BOT_EXPIRATION_TIME_MS,
    hasCollided: false,
    collisionData: null,
    boost: false,
    boostTick: 0,
    maxTrailLength: config.INITIAL_SIZE / 2 + Math.random() * config.INITIAL_SIZE,
    killCount: 0,
    cheatStart: null,
    godmode: true,
    godmodeStartTime: Date.now(),
    isTemporary: true,
    isAdmin: false,
    isGhost: false,
    isFrozen: false,
    lastMouseMove: Date.now(),
    type: "bot",
    lastPosition: { x: startX, y: startY, time: Date.now() },
    teleportViolations: 0,
    particles: [],
  };
}

function updateBot(p, now, deltaTime) {
  if (!p || p.type !== "bot") return;

  if (now >= p.expirationTime) {
    // Pass key for expiration
    handlePlayerDeath(p.id, null, false, null, { reasonKey: "game.deathReason.botExpired" });
    return;
  }

  if (p.godmode && now - p.godmodeStartTime >= config.GODMODE_DURATION / 2) {
    p.godmode = false;
  }

  p.angleChangeTimer += deltaTime;
  if (p.angleChangeTimer >= p.angleChangeInterval) {
    p.targetAngle = Math.random() * 2 * Math.PI;
    p.angleChangeTimer = 0;
    p.angleChangeInterval = 2000 + Math.random() * 3000;
  }

  let diff = Math.atan2(
    Math.sin(p.targetAngle - p.angle),
    Math.cos(p.targetAngle - p.angle)
  );
  const botRotationRate = config.MAX_ROTATION_RATE * 0.5;
  p.angle += Math.max(-botRotationRate, Math.min(botRotationRate, diff));

  const botSpeed = config.SPEED * 0.8;
  p.trail.push({ x: p.x, y: p.y });
  p.x += botSpeed * Math.cos(p.angle);
  p.y += botSpeed * Math.sin(p.angle);

  // Limit trail length based on maxTrailLength
  while (p.trail.length > p.maxTrailLength && p.trail.length > 1) {
      p.trail.shift();
  }
  // Absolute safety limit
  if (p.trail.length > ABSOLUTE_MAX_TRAIL_POINTS) p.trail.shift();


  // Boundary Collision
  const mapCenterX = initialMapWidth / 2;
  const mapCenterY = initialMapHeight / 2;
  const mapRadius = Math.min(mapCenterX, mapCenterY) - 1; // Small buffer
  const mapRadiusSq = mapRadius * mapRadius;
  let hitBoundary = false;
  if (config.MAP_SHAPE === "circle") {
      const dxCenter = p.x - mapCenterX;
      const dyCenter = p.y - mapCenterY;
      if (dxCenter * dxCenter + dyCenter * dyCenter >= mapRadiusSq) {
          hitBoundary = true;
      }
  } else { // Rectangle
      if (p.x <= 0 || p.x >= initialMapWidth || p.y <= 0 || p.y >= initialMapHeight) {
          hitBoundary = true;
      }
  }

  if (hitBoundary) {
    if (!p.hasCollided) {
      p.hasCollided = true;
      // Store key
      p.collisionData = {
        reasonKey: "game.deathReason.boundary",
        isKill: false,
        killerId: null,
      };
    }
    return;
  }

  // Food Consumption
  const nearbyFood = spatialGrid
    .queryNearbyRadius(p.x, p.y, config.COLLISION_RADIUS * 2)
    .filter((item) => item && (item.type === "food" || item.type === "boost_particle"));

  for (const f of nearbyFood) {
    if (!f || f.consumed) continue; // Check if already consumed this tick
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    const distSq = dx * dx + dy * dy;
    const collisionRadiusSq =
      (config.COLLISION_RADIUS + f.size) * (config.COLLISION_RADIUS + f.size);

    if (distSq < collisionRadiusSq) {
      const sizeGain = f.type === "boost_particle" ? 1 : 5;
      p.maxTrailLength += sizeGain;
      f.consumed = true; // Mark as consumed
    }
  }

  // Bot Collision (Player/Bot) - Handled by Worker (if applicable)
  let shouldDispatchBotToWorker = false;
  if (config.SECURITY_MODE === 'high' && !p.hasCollided && !p.godmode) {
    shouldDispatchBotToWorker = true;
  }
  // Bots are always checked server-side if SECURITY_MODE is 'high' or 'medium'.
  // In 'medium' mode, we still check bots server-side because they don't send clientCollisionDetected.
  // They are not "admins" to be trusted.
  else if (config.SECURITY_MODE === 'medium' && !p.hasCollided && !p.godmode) {
    shouldDispatchBotToWorker = true;
  }

  if (shouldDispatchBotToWorker) {    const nearbyEntities = spatialGrid
      .queryNearbyRadius(p.x, p.y, config.COLLISION_RADIUS * 2)
      .filter(
        (item) =>
          item &&
          item.id !== p.id &&
          (item.type === "player" || item.type === "bot") &&
          !item.isGhost &&
          !item.isFrozen &&
          item.trail && item.trail.length > 0
      );

    const relevantOpponentData = nearbyEntities.map((op) => ({
      id: op.id,
      trail: players[op.id]?.trail || [],
    }));

    if (relevantOpponentData.length > 0) {
      dispatchToWorker({
        playerId: p.id,
        playerX: p.x,
        playerY: p.y,
        opponents: relevantOpponentData,
        config: { COLLISION_RADIUS: config.COLLISION_RADIUS },
      });
      pendingCollisions.set(p.id, true);
    }
  }
}
// --- End Bot Management ---

/** Main game loop. */
function gameLoop() {
  const loopStartTime = Date.now();
  const now = loopStartTime;
  const deltaTime = now - (lastRenderTime || now);
  lastRenderTime = now;
  let playersToRemove = [];
  let foodToRemove = new Set();

  const mapCenterX = initialMapWidth / 2;
  const mapCenterY = initialMapHeight / 2;
  const collisionRadiusBuffer = 1;
  const mapRadius = Math.min(mapCenterX, mapCenterY) - collisionRadiusBuffer;
  const mapRadiusSq = mapRadius * mapRadius;

  // --- Update Food ---
  food = food
    .map((f) => {
      if (f.consumed) return null; // Skip already consumed food
      if (now >= f.expirationTime) {
        const timeSinceExpiration = now - f.expirationTime;
        f.opacity = Math.max(
          0,
          1 - timeSinceExpiration / config.FADE_OUT_DURATION
        );
        if (f.opacity === 0) return null;
      }
      return f;
    })
    .filter((f) => f !== null);

  // --- Update Spatial Grid ---
  spatialGrid.clear();
  food.forEach((f) => spatialGrid.insert(f, f.x, f.y));
  for (const id in players)
    spatialGrid.insert(players[id], players[id].x, players[id].y);

  // --- Update Players ---
  const currentPendingCollisions = new Set(pendingCollisions.keys());
  const consumedFoodIdsThisTick = new Set();

  for (let id in players) {
    let p = players[id];
    if (!p) continue;
    if (currentPendingCollisions.has(id)) continue;

    // --- Handle Collision Results First ---
    if (p.hasCollided) {
      // Use the stored key and options
      const { reasonKey, reasonOptions, isKill, killerId } = p.collisionData || {
        reasonKey: "game.deathReason.unknown",
        reasonOptions: {},
        isKill: false,
        killerId: null,
      };
      handlePlayerDeath(id, null, isKill, killerId, { reasonKey, reasonOptions }); // Pass context object
      playersToRemove.push(id);
      continue;
    }

    // --- Ghost Logic ---
    if (p.isGhost) continue;

    // --- Bot Logic ---
    if (p.type === "bot") {
      updateBot(p, now, deltaTime);
      if (p.hasCollided) {
        const { reasonKey, reasonOptions, isKill, killerId } = p.collisionData || {
          reasonKey: "game.deathReason.unknown",
          reasonOptions: {},
          isKill: false,
          killerId: null,
        };
        handlePlayerDeath(id, null, isKill, killerId, { reasonKey, reasonOptions });
        playersToRemove.push(id);
      }
      continue;
    }

    // --- Frozen Player Logic ---
    if (p.isFrozen) {
      // Limit trail length based on maxTrailLength
      while (p.trail.length > p.maxTrailLength && p.trail.length > 1) {
          p.trail.shift();
      }
      if (p.trail.length > ABSOLUTE_MAX_TRAIL_POINTS) p.trail.shift();
      p.lastPosition = { x: p.x, y: p.y, time: now };
      continue;
    }

    // --- Normal Player Logic ---
    if (p.godmode && now - p.godmodeStartTime >= config.GODMODE_DURATION)
      p.godmode = false;

    if (
      now - p.spawnTime >= config.CONTROL_DELAY &&
      typeof p.mouseX === "number" &&
      now - p.lastMouseMove <= MOUSE_ACTIVITY_THRESHOLD
    ) {
      let targetAngle = Math.atan2(p.mouseY - p.y, p.mouseX - p.x);
      let diff = Math.atan2(
        Math.sin(targetAngle - p.angle),
        Math.cos(targetAngle - p.angle)
      );
      p.angle += Math.max(
        -config.MAX_ROTATION_RATE,
        Math.min(config.MAX_ROTATION_RATE, diff)
      );
    }

    const lastTailSegment =
      p.trail.length > 0 ? p.trail[0] : { x: p.x, y: p.y };
    p.trail.push({ x: p.x, y: p.y });

    let sizeLostDuringBoost = 0;
    if (p.boost && p.maxTrailLength <= config.MIN_BOOST_SIZE) {
        p.boost = false;
    }
    if (p.boost) {
      p.boostTick = (p.boostTick || 0) + 1;
      if (p.boostTick >= config.BOOST_CONSUMPTION_INTERVAL) {
        p.boostTick = 0;
        if (p.maxTrailLength > config.MIN_BOOST_SIZE) {
          const oldLength = p.maxTrailLength;
          p.maxTrailLength = Math.max(
            p.maxTrailLength - config.BOOST_CONSUMPTION_RATE,
            config.MIN_BOOST_SIZE
          );
          sizeLostDuringBoost = oldLength - p.maxTrailLength;
        } else {
          p.boost = false;
        }
      }
    } else {
      p.boostTick = 0;
    }
    if (p.maxTrailLength <= config.MIN_BOOST_SIZE) {
        p.boost = false;
    }

    const effectiveSpeed = p.boost ? config.SPEED * 2 : config.SPEED;
    p.x += effectiveSpeed * Math.cos(p.angle);
    p.y += effectiveSpeed * Math.sin(p.angle);

    if (sizeLostDuringBoost > 0 && p.trail.length > 0) {
      const particleX = lastTailSegment.x + (Math.random() - 0.5) * 3;
      const particleY = lastTailSegment.y + (Math.random() - 0.5) * 3;
      spawnFood({
        x: particleX, y: particleY,
        size: 2 + Math.random() * 2,
        color: p.skinData?.bodyColor || p.bodyColor || "rgba(255, 255, 255, 0.7)",
        type: "boost_particle",
        expirationTime: Date.now() + 2000 + Math.random() * 1000,
      });
    }

    // Limit trail length based on maxTrailLength
    while (p.trail.length > p.maxTrailLength && p.trail.length > 1) {
        p.trail.shift();
    }
    if (p.trail.length > ABSOLUTE_MAX_TRAIL_POINTS) p.trail.shift();

    // Anti-Cheat Teleportation
    const deltaTPTime = now - p.lastPosition.time;
    if (deltaTPTime > 0) {
      const dx = p.x - p.lastPosition.x;
      const dy = p.y - p.lastPosition.y;
      const distMoved = Math.sqrt(dx * dx + dy * dy);
      const maxPossibleSpeedPerMs = (config.SPEED * 2) / (1000 / config.FPS);
      const maxDistance = maxPossibleSpeedPerMs * deltaTPTime;
      let toleranceFactor = config.TELEPORT_TOLERANCE_FACTOR;
      if (config.SECURITY_MODE === "low") {
        toleranceFactor *= 1.2;
      } else if (config.SECURITY_MODE === "medium" && p.isAdmin) {
        toleranceFactor *= 1.2;
      }
        config.SECURITY_MODE === "low"
          ? config.TELEPORT_TOLERANCE_FACTOR * 1.2
          : config.TELEPORT_TOLERANCE_FACTOR;
      const teleportThreshold = maxDistance * toleranceFactor;

      if (
        distMoved > teleportThreshold &&
        distMoved > config.COLLISION_RADIUS * 2
      ) {
        p.teleportViolations = (p.teleportViolations || 0) + 1;
        console.warn(
          `Player ${p.name} (${id}) - Teleport violation ${p.teleportViolations}/${config.TELEPORT_VIOLATION_THRESHOLD} (Mode: ${config.SECURITY_MODE})`
        );
        if (p.teleportViolations >= config.TELEPORT_VIOLATION_THRESHOLD) {
          if (!p.hasCollided) {
            p.hasCollided = true;
            // Store key
            p.collisionData = {
              reasonKey: "game.deathReason.teleport",
              isKill: false,
              killerId: null,
            };
            continue;
          }
        }
      } else p.teleportViolations = 0;
      p.lastPosition = { x: p.x, y: p.y, time: now };
    } else if (p.lastPosition.time !== now)
      p.lastPosition = { x: p.x, y: p.y, time: now };

    // Boundary Collision
    let hitBoundary = false;
    if (config.MAP_SHAPE === "circle") {
        const dxCenter = p.x - mapCenterX;
        const dyCenter = p.y - mapCenterY;
        if (dxCenter * dxCenter + dyCenter * dyCenter >= mapRadiusSq) {
            hitBoundary = true;
        }
    } else { // Rectangle
        if (p.x <= 0 || p.x >= initialMapWidth || p.y <= 0 || p.y >= initialMapHeight) {
            hitBoundary = true;
        }
    }

    if (hitBoundary) {
      if (!p.hasCollided) {
        console.log(`Boundary collision detected for ${p.name} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) Shape: ${config.MAP_SHAPE}`);
        p.hasCollided = true;
        // Store key
        p.collisionData = {
          reasonKey: "game.deathReason.boundary",
          isKill: false,
          killerId: null,
        };
        continue;
      }
    }

    // Food Collision & Attraction
    const nearbyFoodPlayer = spatialGrid
      .queryNearbyRadius(p.x, p.y, config.FOOD_ATTRACTION_RADIUS * 1.5)
      .filter(
        (item) =>
          item &&
          (item.type === "food" || item.type === "boost_particle") &&
          !consumedFoodIdsThisTick.has(item.id) &&
          !item.consumed
      );

    for (const f of nearbyFoodPlayer) {
      if (!f) continue;
      const dx = p.x - f.x;
      const dy = p.y - f.y;
      const distSq = dx * dx + dy * dy;
      const collisionRadiusSq =
        (config.COLLISION_RADIUS + f.size) *
        (config.COLLISION_RADIUS + f.size);
      const snapDistSq = config.FOOD_SNAP_DISTANCE * config.FOOD_SNAP_DISTANCE;
      const attractionRadiusSq =
        (config.COLLISION_RADIUS + config.FOOD_ATTRACTION_RADIUS) ** 2;

      if (distSq < collisionRadiusSq || distSq < snapDistSq) {
        const sizeGain = f.type === "boost_particle" ? 1 : 5;
        p.maxTrailLength += sizeGain;
        consumedFoodIdsThisTick.add(f.id);
        foodToRemove.add(f.id);
        f.consumed = true; // Mark as consumed
        continue;
      }

      if (f.type === "food" && distSq < attractionRadiusSq) {
        const angleToFood = Math.atan2(f.y - p.y, f.x - p.x);
        let angleDiff = Math.abs(angleToFood - p.angle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        if (angleDiff < Math.PI / 2) {
          const moveFactor = config.FOOD_ATTRACTION_STRENGTH;
          f.x += (p.x - f.x) * moveFactor;
          f.y += (p.y - f.y) * moveFactor;
          const newDx = p.x - f.x;
          const newDy = p.y - f.y;
          const newDistSq = newDx * newDx + newDy * newDy;
          if (newDistSq < collisionRadiusSq) {
            p.maxTrailLength += 5;
            consumedFoodIdsThisTick.add(f.id);
            foodToRemove.add(f.id);
            f.consumed = true; // Mark as consumed
          }
        }
      }
    }

    // Anti-Cheat Self-Collision
    let selfColliding = false;
    if (p.trail.length > config.SAFE_COUNT) {
      const checkLimit = Math.min(p.trail.length - config.SAFE_COUNT, 100);
      for (let i = 0; i < checkLimit; i++) {
        let seg = p.trail[i];
        let dx = p.x - seg.x;
        let dy = p.y - seg.y;
        if (dx * dx + dy * dy < config.COLLISION_RADIUS ** 2) {
          selfColliding = true;
          break;
        }
      }
    }
    if (selfColliding) {
      if (!p.cheatStart) p.cheatStart = now;
      else if (now - p.cheatStart > config.CHEAT_DURATION) {
        if (!p.hasCollided) {
          p.hasCollided = true;
          // Store key
          p.collisionData = {
            reasonKey: "game.deathReason.selfCollision",
            isKill: false,
            killerId: null,
          };
          continue;
        }
      }
    } else p.cheatStart = null;

    // Inactivity check
    if (now - p.lastMouseMove > 20000) {
      if (!p.hasCollided) {
        p.hasCollided = true;
        // Store key
        p.collisionData = {
          reasonKey: "game.deathReason.inactivity",
          isKill: false,
          killerId: null,
        };
        continue;
      }
    }

    // Player vs Player/Bot Collision (Worker dispatch logic)
    let shouldDispatchToWorker = false;
    if (config.SECURITY_MODE === 'high' && !p.hasCollided && !p.godmode) {
        shouldDispatchToWorker = true;
    } else if (config.SECURITY_MODE === 'medium' && !p.isAdmin && !p.hasCollided && !p.godmode) {
        shouldDispatchToWorker = true;
    }
    // In 'medium' mode, admins are not checked by worker, they rely on clientCollisionDetected.
    // In 'low' mode, no one is checked by worker.

    if (shouldDispatchToWorker) {
      const opponentCheckRadius = 500;
      const nearbyEntities = spatialGrid
        .queryNearbyRadius(p.x, p.y, opponentCheckRadius)
        .filter(
          (item) =>
            item &&
            item.id !== p.id &&
            (item.type === "player" || item.type === "bot") &&
            !item.isGhost &&
            !item.isFrozen &&
            item.trail && item.trail.length > 0
        );

      const relevantOpponentData = nearbyEntities.map((op) => ({
        id: op.id,
        trail: players[op.id]?.trail || [],
      }));

      if (relevantOpponentData.length > 0) {
        dispatchToWorker({
          playerId: id,
          playerX: p.x,
          playerY: p.y,
          opponents: relevantOpponentData,
          config: { COLLISION_RADIUS: config.COLLISION_RADIUS },
        });
        pendingCollisions.set(id, true);
      }
    }
  } // End player loop

  if (foodToRemove.size > 0) {
    food = food.filter((f) => f && !foodToRemove.has(f.id));
  }

  playersToRemove.forEach((id) => {
    // Clean up static data cache
    if (playerStaticDataCache[id]) {
      delete playerStaticDataCache[id];
    }
    delete players[id];
    pendingCollisions.delete(id);
  });

  // --- Send State (Area of Interest Implementation) ---
  // Throttled state emission based on adaptive interval
  if (now - lastStateEmitTime >= currentStateEmitInterval) {
    lastStateEmitTime = now;

    const allFoodData = food.map((f) => ({
      id: f.id, x: f.x, y: f.y, size: f.size, color: f.color, opacity: f.opacity, type: f.type,
    }));

    for (const playerId in players) {
      const p = players[playerId];
      if (!p || p.type !== "player") continue; // Send state only to human players

      const stateForPlayer = { players: {}, food: [] };
      const aoiRadiusSq = config.AOI_RADIUS * config.AOI_RADIUS;

      // Include self always
      // Check if static data has changed
      const staticDataChanged = hasPlayerStaticDataChanged(playerId, p);
      
      // Always include dynamic data, but only include static data if it changed or it's a new player
      stateForPlayer.players[playerId] = {
        x: p.x, y: p.y, trail: p.trail, boost: p.boost, godmode: p.godmode,
        godmodeStartTime: p.godmodeStartTime, isGhost: p.isGhost, isFrozen: p.isFrozen,
        maxTrailLength: p.maxTrailLength, type: p.type, angle: p.angle // Include angle
      };
      
      // Add static data only if it changed or it's a new player
      if (staticDataChanged) {
        stateForPlayer.players[playerId].name = p.name;
        stateForPlayer.players[playerId].headColor = p.headColor;
        stateForPlayer.players[playerId].bodyColor = p.bodyColor;
        stateForPlayer.players[playerId].skinData = p.skinData;
      }

      // Include nearby players/bots
      const nearbyEntities = spatialGrid.queryNearbyRadius(p.x, p.y, config.AOI_RADIUS);
      nearbyEntities.forEach((entity) => {
        if (entity.id === playerId) return; // Already included self
        if (entity.type === "player" || entity.type === "bot") {
          const nearbyP = players[entity.id];
          if (nearbyP) {
            // Check if static data has changed for this nearby player
            const nearbyStaticDataChanged = hasPlayerStaticDataChanged(entity.id, nearbyP);
            
            // Always include dynamic data, but only include static data if it changed or it's a new player
            stateForPlayer.players[entity.id] = {
              x: nearbyP.x, y: nearbyP.y, trail: nearbyP.trail,
              boost: nearbyP.boost, godmode: nearbyP.godmode, godmodeStartTime: nearbyP.godmodeStartTime,
              isGhost: nearbyP.isGhost, isFrozen: nearbyP.isFrozen, maxTrailLength: nearbyP.maxTrailLength,
              type: nearbyP.type, angle: nearbyP.angle // Include angle
            };
            
            // Add static data only if it changed or it's a new player
            if (nearbyStaticDataChanged) {
              stateForPlayer.players[entity.id].name = nearbyP.name;
              stateForPlayer.players[entity.id].headColor = nearbyP.headColor;
              stateForPlayer.players[entity.id].bodyColor = nearbyP.bodyColor;
              stateForPlayer.players[entity.id].skinData = nearbyP.skinData;
            }
          }
        }
      });

      // Include nearby food
      stateForPlayer.food = allFoodData.filter((f) => {
        const dx = f.x - p.x;
        const dy = f.y - p.y;
        return dx * dx + dy * dy <= aoiRadiusSq;
      });

      io.to(playerId).emit("state", stateForPlayer);
    }
  }

  // Admin Message
  if (adminMessage.text && now - adminMessage.startTime >= adminMessage.duration)
    adminMessage.text = "";

  // Leaderboard (Throttled)
  const LEADERBOARD_INTERVAL = config.LEADERBOARD_UPDATE_INTERVAL || 500;
  if (now - lastLeaderboardEmit > LEADERBOARD_INTERVAL) {
    // Update leaderboard cache if needed
    const LEADERBOARD_CACHE_DURATION = config.LEADERBOARD_CACHE_DURATION || 200;
    if (!cachedLeaderboard || (now - lastLeaderboardUpdate) > LEADERBOARD_CACHE_DURATION) {
      cachedLeaderboard = getLeaderboard();
      lastLeaderboardUpdate = now;
    }
    io.emit("leaderboard", cachedLeaderboard);
    lastLeaderboardEmit = now;
  }

  // Update state emit interval based on performance
  const loopEndTime = Date.now();
  const processingTime = loopEndTime - loopStartTime;
  updateStateEmitInterval(processingTime, now);
}

// --- Function to start/stop food spawning interval ---
function checkFoodSpawning() {
  if (!foodSpawnIntervalId) {
    const spawnInterval = Math.max(50, config.FOOD_SPAWN_INTERVAL);
    foodSpawnIntervalId = setInterval(() => spawnFood({}), spawnInterval);
    console.log(`Food spawning started (interval: ${spawnInterval}ms)`);
  }
}

// --- Function to start/stop bot spawning interval ---
function checkBotSpawning() {
  if (config.BOTS_ENABLED && !botSpawnIntervalId) {
    const spawnInterval = Math.max(500, config.BOT_SPAWN_INTERVAL_MS);
    botSpawnIntervalId = setInterval(spawnBot, spawnInterval);
    console.log(`Bot spawning started (interval: ${spawnInterval}ms)`);
  } else if (!config.BOTS_ENABLED && botSpawnIntervalId) {
    clearInterval(botSpawnIntervalId);
    botSpawnIntervalId = null;
    console.log("Bot spawning stopped (disabled in config).");
  }
}

// --- Function called by admin route to update bot settings ---
function updateBotSettings() {
  console.log("Updating bot settings...");
  if (botSpawnIntervalId) {
    clearInterval(botSpawnIntervalId);
    botSpawnIntervalId = null;
  }
  checkBotSpawning();
}

/** Starts the game loop and spawners. */
function startGameLoop() {
  if (gameLoopIntervalId) clearInterval(gameLoopIntervalId);
  const interval = Math.max(16, 1000 / config.FPS);
  console.log(`Starting game loop (${config.FPS} FPS -> ${interval}ms)`);
  gameLoopIntervalId = setInterval(gameLoop, interval);
  lastRenderTime = Date.now();

  checkFoodSpawning();
  checkBotSpawning();
}

/** Stops the game loop and spawners. */
function stopGameLoop() {
  if (gameLoopIntervalId) {
    clearInterval(gameLoopIntervalId);
    gameLoopIntervalId = null;
    console.log("Game loop stopped.");
  }
  if (foodSpawnIntervalId) {
    clearInterval(foodSpawnIntervalId);
    foodSpawnIntervalId = null;
    console.log("Food spawning stopped.");
  }
  if (botSpawnIntervalId) {
    clearInterval(botSpawnIntervalId);
    botSpawnIntervalId = null;
    console.log("Bot spawning stopped.");
  }
}

module.exports = {
  init,
  startGameLoop,
  stopGameLoop,
  checkFoodSpawning,
  handlePlayerDeath,
  updateBotSettings,
  findSafeSpawnLocation, // Export the new function
  getRandomSpawnLocation, // Export the fallback function
};
