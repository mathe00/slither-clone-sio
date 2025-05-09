// --- public/game-main.js ---
/**
 * ==============================================================================
 * FILE: game-main.js
 *
 * DESCRIPTION:
 * Main client-side game logic orchestrator. Initializes and manages the Socket.IO
 * connection, handles local game state updates received from the server, manages
 * user inputs (mouse movement, boost, admin clicks/keys, zoom), controls the
 * main game loop (`requestAnimationFrame`), updates the camera, triggers particle
 * spawning (via TrailEffects), initiates rendering (via GameRenderer), handles
 * client-side collision detection (for 'low' security mode), and updates HUD UI elements.
 * Uses i18next for user-facing text.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Coordinate state updates with rendering and input handling.
 * ==============================================================================
 */

// Depends on WebGLUtils, GameRenderer, TrailEffects, SoundManager, ui-logic.js being loaded.
// Assumes global 'i18next' instance is available and initialized.

// Wrap entire game logic in DOMContentLoaded to ensure elements exist
document.addEventListener("DOMContentLoaded", () => {
  // Encapsulate game logic in a namespace/IIFE
  const Game = (() => {
    // --- Game Variables ---
    let localSocket = null;
    let localMyId = null;
    let gameState = { players: {}, food: [] };
    let boosting = false;
    let worldWidth = 4000;
    let worldHeight = 4000;
    let mapShape = "rectangle";
    let mapRadius = 0;
    let zoomLevel = 1.0;
    let animationFrameId = null;
    let cameraX = 0;
    let cameraY = 0;
    let lastRenderTime = 0;
    let isGhostMode = false;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartCameraX = 0;
    let panStartCameraY = 0;
    const MIN_ZOOM = 0.2;
    const MAX_ZOOM = 5.0;
    const ZOOM_SENSITIVITY = 0.1;
    let selectedPlayerId = null;
    let selectedPlayerName = null;
    const ADMIN_CLICK_RADIUS = 25; // Screen pixels

    // --- WebGL Specific Variables (Managed by WebGLUtils) ---
    let clientCollisionRadius = 12; // Default, will be overwritten by server
    let canvas = null; // Main canvas element
    let textOverlayCanvas = null; // 2D Canvas for text overlay
    let textOverlayCtx = null; // 2D context for text overlay

    // --- UI Elements ---
    let snakeSizeDisplay = null;
    let snakePositionDisplay = null;
    let ghostShortcutGuide = null;
    let minimapCanvas = null;

    // --- i18next Helper ---
    function t(key, options = {}) {
      if (window.i18next && window.i18next.isInitialized) {
        return window.i18next.t(key, options);
      }
      console.warn(`i18next not ready, using fallback for key: ${key}`);
      const fallback = key.split(".").pop();
      return options.defaultValue || fallback || key;
    }

    // --- Helper Functions ---
    function calculateHashCode(str) {
      var hash = 0, i, chr;
      if (!str || str.length === 0) return hash;
      for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0; // Convert to 32bit integer
      }
      return Math.abs(hash);
    }

    // --- Canvas Resizing ---
    function resizeCanvas() {
      if (!canvas) return;
      const gl = WebGLUtils.getContext();
      if (!gl) return;

      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        console.log("WebGL Canvas resized to:", displayWidth, displayHeight);
      }

      if (textOverlayCanvas) {
        textOverlayCanvas.width = displayWidth;
        textOverlayCanvas.height = displayHeight;
        console.log(
          "Text Overlay Canvas resized to:",
          displayWidth,
          displayHeight
        );
      }

      if (minimapCanvas) {
        minimapCanvas.width = minimapCanvas.offsetWidth;
        minimapCanvas.height = minimapCanvas.offsetHeight;
      }
    }
    window.addEventListener("resize", resizeCanvas);

    // --- Game Loop Functions ---
    function startGameLoop() {
      if (!animationFrameId) {
        resizeCanvas();
        if (snakeSizeDisplay) {
          // Use translation key
          snakeSizeDisplay.textContent = t('hud.sizeLabel', { size: 0 });
          snakeSizeDisplay.style.opacity = "1";
        }
        if (snakePositionDisplay) {
          // Use translation key
          snakePositionDisplay.textContent = t('hud.positionLabel', { x: 0, y: 0 });
          snakePositionDisplay.style.opacity = "1";
        }
        if (ghostShortcutGuide) {
          ghostShortcutGuide.style.display = isGhostMode ? "block" : "none";
          ghostShortcutGuide.classList.toggle("visible", isGhostMode);
          updateShortcutGuide(); // Translate guide text
        }
        lastRenderTime = performance.now();
        animationFrameId = requestAnimationFrame(gameLoop);
        console.log("WebGL Game loop started.");
      }
    }

    function stopGameLoop() {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        if (snakeSizeDisplay) snakeSizeDisplay.style.opacity = "0";
        if (snakePositionDisplay) snakePositionDisplay.style.opacity = "0";
        if (ghostShortcutGuide) {
          ghostShortcutGuide.style.display = "none";
          ghostShortcutGuide.classList.remove("visible");
        }
        console.log("WebGL Game loop stopped.");
      }
    }

    function gameLoop(currentTime) {
      const gl = WebGLUtils.getContext();
      if (!gl) {
        animationFrameId = null;
        return;
      }
      const deltaTime = currentTime - lastRenderTime;
      lastRenderTime = currentTime;

      updateCamera();
      updateParticles(currentTime, deltaTime);

      GameRenderer.drawGame(
        gl,
        canvas,
        textOverlayCtx,
        textOverlayCanvas,
        WebGLUtils.getShaders(),
        WebGLUtils.getBuffers(),
        WebGLUtils.getTextures(),
        gameState,
        cameraX,
        cameraY,
        zoomLevel,
        worldWidth,
        worldHeight,
        mapShape,
        mapRadius,
        localMyId,
        selectedPlayerId,
        currentTime,
        maybeSpawnParticle,
        clientCollisionRadius
      );

      checkClientSideCollisions();
      updateUIText(); // Update HUD text with translations

      animationFrameId = requestAnimationFrame(gameLoop);
    }

    function updateCamera() {
      if (!canvas) return;
      if (isGhostMode) {
        cameraX = Math.max(0, Math.min(worldWidth, cameraX));
        cameraY = Math.max(0, Math.min(worldHeight, cameraY));
      } else {
        if (!localMyId || !gameState.players[localMyId]) {
          cameraX = worldWidth / 2;
          cameraY = worldHeight / 2;
        } else {
          const player = gameState.players[localMyId];
          cameraX = player.x;
          cameraY = player.y;
        }
      }
    }

    function updateParticles(currentTime, deltaTime) {
      if (!gameState.players) return;
      const particleFadeDuration = GameRenderer.PARTICLE_FADE_DURATION;

      for (const id in gameState.players) {
        const p = gameState.players[id];
        if (!p || !p.particles) continue;
        p.particles = p.particles.filter((particle) => {
          const age = currentTime - particle.spawnTime;
          if (age >= particle.life) return false;
          particle.x += particle.vx * (deltaTime / 1000);
          particle.y += particle.vy * (deltaTime / 1000);
          const timeUntilDeath = particle.life - age;
          if (timeUntilDeath < particleFadeDuration) {
            particle.opacity = Math.max(0, timeUntilDeath / particleFadeDuration);
          } else {
            particle.opacity = 1;
          }
          return true;
        });
      }
    }

    function maybeSpawnParticle(player, segmentX, segmentY, currentTime) {
      if (
        !player ||
        !player.skinData ||
        player.skinData.trailEffect === "none" ||
        !player.particles
      ) {
        return;
      }
      if (player.particles.length >= GameRenderer.MAX_PARTICLES_PER_PLAYER) {
        return;
      }
      const effectName = player.skinData.trailEffect;
      if (window.TrailEffects && typeof window.TrailEffects.spawnParticle === 'function') {
        const particleData = window.TrailEffects.spawnParticle(
          effectName,
          player,
          segmentX,
          segmentY,
          currentTime
        );
        if (particleData) {
          player.particles.push(particleData);
        }
      } else {
        console.warn(`Trail effect function for "${effectName}" not found.`);
      }
    }

    let hasLocallyCollided = false;
    function checkClientSideCollisions() {
        if (!localSocket || !localSocket.connected || !localMyId || hasLocallyCollided) return;
        const myPlayer = gameState.players[localMyId];
        if (!myPlayer || myPlayer.isGhost || myPlayer.godmode || myPlayer.hasCollided) {
            if (hasLocallyCollided && (!myPlayer || !myPlayer.hasCollided)) {
                hasLocallyCollided = false;
            }
            return;
        }
        const headX = myPlayer.x;
        const headY = myPlayer.y;
        const radiusSq = clientCollisionRadius * clientCollisionRadius;

        for (const opponentId in gameState.players) {
            if (opponentId === localMyId) continue;
            const opponent = gameState.players[opponentId];
            if (!opponent || opponent.isGhost || opponent.isFrozen || !opponent.trail || opponent.trail.length < 1) continue;
            const checkLimit = opponent.trail.length;
            for (let i = 0; i < checkLimit; i++) {
                const seg = opponent.trail[i];
                if (!seg) continue;
                const dx = headX - seg.x;
                const dy = headY - seg.y;
                if ((dx * dx + dy * dy) < radiusSq) {
                    console.log(`Client collision detected: My head (${localMyId}) vs trail of ${opponentId} at segment ${i}`);
                    // Send key for reason
                    localSocket.emit('clientCollisionDetected', { reasonKey: "game.deathReason.clientCollision", killerId: opponentId });
                    hasLocallyCollided = true;
                    return;
                }
            }
        }
    }

    // --- UI Text Update ---
    function updateUIText() {
      if (
        localMyId &&
        gameState.players[localMyId] &&
        !isGhostMode &&
        snakeSizeDisplay
      ) {
        let currentSize = gameState.players[localMyId].maxTrailLength || 0;
        // Use translation key
        snakeSizeDisplay.textContent = t('hud.sizeLabel', { size: currentSize });
      } else if (animationFrameId && snakeSizeDisplay) {
        // Use translation key
        snakeSizeDisplay.textContent = isGhostMode ? t('hud.ghostMode') : t('hud.spectator');
      }

      if (
        localMyId &&
        gameState.players[localMyId] &&
        !isGhostMode &&
        snakePositionDisplay
      ) {
        const player = gameState.players[localMyId];
        const posX = Math.round(player.x);
        const posY = Math.round(player.y);
        // Use translation key
        snakePositionDisplay.textContent = t('hud.positionLabel', { x: posX, y: posY });
      } else if (animationFrameId && snakePositionDisplay) {
        snakePositionDisplay.textContent = "";
      }
    }

    // --- Input Handling ---
    const handleMouseMove = (e) => {
      if (!canvas || !localSocket || !localSocket.connected) return;
      const rect = canvas.getBoundingClientRect();
      const mouseCanvasX = e.clientX - rect.left;
      const mouseCanvasY = e.clientY - rect.top;
      const worldX = cameraX + (mouseCanvasX - canvas.width / 2) / zoomLevel;
      const worldY = cameraY - (mouseCanvasY - canvas.height / 2) / zoomLevel;

      if (isGhostMode) {
        if (isPanning) {
          const screenDx = mouseCanvasX - panStartX;
          const screenDy = mouseCanvasY - panStartY;
          cameraX = panStartCameraX - screenDx / zoomLevel;
          cameraY = panStartCameraY + screenDy / zoomLevel;
          cameraX = Math.max(0, Math.min(worldWidth, cameraX));
          cameraY = Math.max(0, Math.min(worldHeight, cameraY));
        }
      } else {
        localSocket.emit("mouse_move", { x: worldX, y: worldY });
      }
    };

    const handleMouseDown = (e) => {
      if (!canvas || !localSocket || !localSocket.connected) return;
      if (isGhostMode) {
        if (e.button === 0) {
          const rect = canvas.getBoundingClientRect();
          const clickCanvasX = e.clientX - rect.left;
          const clickCanvasY = e.clientY - rect.top;
          const clickWorldX = cameraX + (clickCanvasX - canvas.width / 2) / zoomLevel;
          const clickWorldY = cameraY - (clickCanvasY - canvas.height / 2) / zoomLevel;

          let clickedPlayerId = null;
          let minDistanceSq = Infinity;
          const clickRadiusWorldSq = (ADMIN_CLICK_RADIUS / zoomLevel) ** 2;

          for (const id in gameState.players) {
            const p = gameState.players[id];
            if (!p || p.isGhost || id === localMyId) continue;
            const dx = clickWorldX - p.x;
            const dy = clickWorldY - p.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < clickRadiusWorldSq && distSq < minDistanceSq) {
              minDistanceSq = distSq;
              clickedPlayerId = id;
            }
          }

          if (clickedPlayerId) {
            selectedPlayerId = clickedPlayerId;
            selectedPlayerName = gameState.players[clickedPlayerId]?.name || t('ghostMode.unknownPlayer'); // Translate fallback
            updateShortcutGuide(); // Translate guide
            isPanning = false;
            canvas.style.cursor = "crosshair";
          } else {
            selectedPlayerId = null;
            selectedPlayerName = null;
            updateShortcutGuide(); // Translate guide
            isPanning = true;
            panStartX = clickCanvasX;
            panStartY = clickCanvasY;
            panStartCameraX = cameraX;
            panStartCameraY = cameraY;
            localSocket.emit("startPan", { x: clickWorldX, y: clickWorldY });
            canvas.style.cursor = "grabbing";
          }
        }
      } else {
        if (e.button === 0 && !boosting) {
          localSocket.emit("boost", { boost: true });
          boosting = true;
        }
      }
    };

    const handleMouseUp = (e) => {
      if (!canvas || !localSocket || !localSocket.connected) return;
      if (isGhostMode) {
        if (e.button === 0 && isPanning) {
          isPanning = false;
          localSocket.emit("endPan");
          canvas.style.cursor = selectedPlayerId ? "crosshair" : "grab";
        }
      } else {
        if (e.button === 0 && boosting) {
          localSocket.emit("boost", { boost: false });
          boosting = false;
        }
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    const handleKeyDown = (e) => {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      )
        return;
      if (isGhostMode) {
        if (selectedPlayerId && localSocket && localSocket.connected) {
          let action = null;
          if (e.code === "KeyK") action = "kill";
          else if (e.code === "KeyC") action = "clear";
          else if (e.code === "KeyF") action = "freeze";
          if (action) {
            e.preventDefault();
            localSocket.emit("adminAction", {
              targetPlayerId: selectedPlayerId,
              action,
            });
          }
        }
        if (e.code === "Escape" && selectedPlayerId) {
          e.preventDefault();
          selectedPlayerId = null;
          selectedPlayerName = null;
          updateShortcutGuide(); // Translate guide
          if (canvas) canvas.style.cursor = "grab";
        }
      } else {
        if (e.code === "Space" && !boosting) {
          if (localSocket && localSocket.connected) {
            localSocket.emit("boost", { boost: true });
            boosting = true;
          }
        } else if (e.code === "KeyP") {
          if (localSocket && localSocket.connected) localSocket.emit("secretGrow");
        }
      }
      if (e.code === 'KeyF' && !isGhostMode) {
          e.preventDefault();
          if (localSocket && localSocket.connected) localSocket.emit("toggleSelfFreeze");
      }
    };

    const handleKeyUp = (e) => {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      )
        return;
      if (!isGhostMode) {
        if (e.code === "Space" && boosting) {
          if (localSocket && localSocket.connected) {
            localSocket.emit("boost", { boost: false });
            boosting = false;
          }
        }
      }
    };

    const handleMouseWheel = (e) => {
      if (!canvas || !localSocket || !localSocket.connected || !isGhostMode)
        return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseCanvasX = e.clientX - rect.left;
      const mouseCanvasY = e.clientY - rect.top;
      const mouseWorldXBeforeZoom = cameraX + (mouseCanvasX - canvas.width / 2) / zoomLevel;
      const mouseWorldYBeforeZoom = cameraY - (mouseCanvasY - canvas.height / 2) / zoomLevel;

      const scrollDelta = Math.sign(e.deltaY);
      const zoomFactor = 1 - scrollDelta * ZOOM_SENSITIVITY;
      let newZoomLevel = zoomLevel * zoomFactor;
      newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));
      zoomLevel = newZoomLevel;

      cameraX = mouseWorldXBeforeZoom - (mouseCanvasX - canvas.width / 2) / zoomLevel;
      cameraY = mouseWorldYBeforeZoom + (mouseCanvasY - canvas.height / 2) / zoomLevel;

      cameraX = Math.max(0, Math.min(worldWidth, cameraX));
      cameraY = Math.max(0, Math.min(worldHeight, cameraY));
    };

    const inputHandlers = {
      mousemove: handleMouseMove,
      mousedown: handleMouseDown,
      mouseup: handleMouseUp,
      contextmenu: handleContextMenu,
      keydown: handleKeyDown,
      keyup: handleKeyUp,
      wheel: handleMouseWheel,
    };
    let inputListenersAttached = false;

    function addInputListeners() {
      if (inputListenersAttached || !canvas) return;
      canvas.addEventListener("mousemove", inputHandlers.mousemove);
      canvas.addEventListener("mousedown", inputHandlers.mousedown);
      canvas.addEventListener("mouseup", inputHandlers.mouseup);
      canvas.addEventListener("contextmenu", inputHandlers.contextmenu);
      window.addEventListener("keydown", inputHandlers.keydown);
      window.addEventListener("keyup", inputHandlers.keyup);
      canvas.addEventListener("wheel", inputHandlers.wheel, { passive: false });
      inputListenersAttached = true;
      canvas.style.cursor = isGhostMode
        ? selectedPlayerId
          ? "crosshair"
          : "grab"
        : "default";
    }

    function removeInputListeners() {
      if (!inputListenersAttached || !canvas) return;
      canvas.removeEventListener("mousemove", inputHandlers.mousemove);
      canvas.removeEventListener("mousedown", inputHandlers.mousedown);
      canvas.removeEventListener("mouseup", inputHandlers.mouseup);
      canvas.removeEventListener("contextmenu", inputHandlers.contextmenu);
      window.removeEventListener("keydown", inputHandlers.keydown);
      window.removeEventListener("keyup", inputHandlers.keyup);
      canvas.removeEventListener("wheel", inputHandlers.wheel);
      inputListenersAttached = false;
      canvas.style.cursor = "default";
    }

    // Update Shortcut Guide with translations
    function updateShortcutGuide() {
      if (!ghostShortcutGuide || !isGhostMode) return;
      if (selectedPlayerId && selectedPlayerName) {
        // Use translation keys, allow HTML for span
        ghostShortcutGuide.innerHTML = t('ghostMode.selected', {
            name: selectedPlayerName,
            interpolation: { escapeValue: false } // Allow span tag
        }) + '<br>' + t('ghostMode.controlsSelected');
      } else {
        // Use translation keys
        ghostShortcutGuide.innerHTML = t('ghostMode.controlsGeneral');
      }
    }

    // --- Public Methods ---
    function initializeAndStart(socketInstance, clientId, overlayCanvasElement) {
      console.log(
        "Initializing Main Game with socket:",
        socketInstance.id,
        "My ID:",
        clientId
      );
      localSocket = socketInstance;
      localMyId = clientId;
      canvas = document.getElementById("gameCanvas");
      textOverlayCanvas = overlayCanvasElement;

      if (!canvas) {
        console.error("Main canvas not found!");
        return;
      }
      if (!textOverlayCanvas) {
        console.error("Text overlay canvas not found!");
        return;
      }

      if (!WebGLUtils.initialize(canvas)) {
        return;
      }

      textOverlayCtx = textOverlayCanvas.getContext("2d");
      if (!textOverlayCtx) {
        console.error("Failed to get 2D context for text overlay!");
        return;
      }

      snakeSizeDisplay = document.getElementById("snakeSizeDisplay");
      snakePositionDisplay = document.getElementById("snakePositionDisplay");
      ghostShortcutGuide = document.getElementById("ghostShortcutGuide");
      minimapCanvas = document.getElementById("minimapCanvas");

      gameState = { players: {}, food: [] };
      boosting = false;
      isGhostMode = false;
      isPanning = false;
      selectedPlayerId = null;
      selectedPlayerName = null;
      zoomLevel = 1.0;
      mapShape = "rectangle";
      mapRadius = 0;
      cameraX = worldWidth / 2;
      cameraY = worldHeight / 2;
      hasLocallyCollided = false;
      if (snakePositionDisplay) snakePositionDisplay.textContent = "";

      if (localSocket) {
        localSocket.off("state");
        localSocket.off("gameOver");
        localSocket.off("mapSizeUpdate");
        localSocket.off("configUpdate");
        localSocket.off("killConfirmed");
        localSocket.off("adminActionFeedback");
        localSocket.off("kicked");
        localSocket.off("banned");
        localSocket.off('clientCollisionDetected');
      } else {
        console.error("Socket instance is null during initialization!");
        return;
      }

      localSocket.on("state", (state) => {
        for (const id in state.players) {
          if (gameState.players[id] && state.players[id]) {
            state.players[id].particles = gameState.players[id].particles || [];
          } else if (state.players[id]) {
            state.players[id].particles = [];
          }
        }
        if (selectedPlayerId && !state.players[selectedPlayerId]) {
          selectedPlayerId = null;
          selectedPlayerName = null;
          updateShortcutGuide(); // Translate guide
          if (canvas) canvas.style.cursor = "grab";
        }
        gameState = state;
      });

      // Handle gameOver with reasonKey and reasonOptions
      localSocket.on("gameOver", (data) => {
        if (typeof showGameOverOverlay === "function") {
          // Pass key and options to the UI function
          showGameOverOverlay(data.reasonKey, data.reasonOptions, data.kill, data.finalSize);
        } else {
          // Fallback alert (will show key if ui-logic not ready)
          alert(t(data.reasonKey, data.reasonOptions) + " - Game Over");
        }
        stopGame();
      });

      localSocket.on("mapSizeUpdate", (data) => {
        console.log("Map size update received:", data);
        clientCollisionRadius = data.collisionRadius || 12;
        worldWidth = data.width;
        worldHeight = data.height;
        mapShape = data.shape || "rectangle";
        mapRadius = data.radius || 0;
        zoomLevel = data.zoom || 1.0;
        isGhostMode = data.isGhost || false;
        resizeCanvas();
        if (canvas)
          canvas.style.cursor = isGhostMode
            ? selectedPlayerId
              ? "crosshair"
              : "grab"
            : "default";
        if (ghostShortcutGuide) {
          ghostShortcutGuide.style.display = isGhostMode ? "block" : "none";
          ghostShortcutGuide.classList.toggle("visible", isGhostMode);
          updateShortcutGuide(); // Translate guide
        }
        if (isGhostMode && gameState.players && gameState.players[localMyId]) {
          cameraX = gameState.players[localMyId].x;
          cameraY = gameState.players[localMyId].y;
        } else {
          cameraX = worldWidth / 2;
          cameraY = worldHeight / 2;
        }
      });

      localSocket.on("configUpdate", (data) => {
        if (data.zoomLevel !== undefined) {
          zoomLevel = data.zoomLevel;
        }
        if (data.collisionRadius !== undefined) {
            clientCollisionRadius = data.collisionRadius;
        }
      });

      localSocket.on("killConfirmed", () => {
        if (!isGhostMode && typeof playSoundForEvent === "function")
          playSoundForEvent("kill");
      });

      // Handle feedback with keys and options
      localSocket.on("adminActionFeedback", (data) => {
        if (typeof showNotification === "function")
          // Translate the message using the key and options
          showNotification(t(data.messageKey, data.messageOptions), data.success ? "success" : "error");
        else console.log("Admin Feedback:", data);
      });

      // Handle kick/ban with keys and options
      localSocket.on("kicked", (data) => {
        alert(t(data.reasonKey, data.reasonOptions || {})); // Translate reason
        if (localSocket) localSocket.disconnect();
      });
      localSocket.on("banned", (data) => {
        alert(t(data.reasonKey, data.reasonOptions || {})); // Translate reason
        if (localSocket) localSocket.disconnect();
      });

      addInputListeners();
      startGameLoop();
    }

    function stopGame() {
      stopGameLoop();
      removeInputListeners();
      gameState = { players: {}, food: [] };
      boosting = false;
      isGhostMode = false;
      isPanning = false;
      selectedPlayerId = null;
      selectedPlayerName = null;
      hasLocallyCollided = false;

      WebGLUtils.cleanup();

      if (textOverlayCtx) {
        textOverlayCtx.clearRect(
          0,
          0,
          textOverlayCanvas.width,
          textOverlayCanvas.height
        );
      }
      if (snakePositionDisplay) snakePositionDisplay.textContent = "";

      console.log("Main Game stopped and cleaned up.");
    }

    function updateConfig(data) {
      if (data.zoomLevel !== undefined) {
        zoomLevel = data.zoomLevel;
      }
      if (data.collisionRadius !== undefined) {
          clientCollisionRadius = data.collisionRadius;
      }
    }

    return { initializeAndStart, stopGame, updateConfig };
  })();

  window.Game = Game;
});
