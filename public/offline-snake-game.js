// --- public/offline-snake-game.js ---
/**
 * ==============================================================================
 * FILE: offline-snake-game.js
 *
 * DESCRIPTION:
 * Implements a simple, classic Snake game using the HTML5 Canvas 2D API.
 * This game is displayed on the offline.html page as entertainment while the
 * main server connection is being re-established. Handles game loop, input
 * (Arrows/WASD/ZQSD), rendering, scoring, and game over state.
 * Uses i18next for user-facing text.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * ==============================================================================
 */

// Assumes global 'i18next' instance is available and initialized from offline.html.

console.log('offline-snake-game.js executing');

const snakeGame = (() => {
  const canvas = document.getElementById('snakeGameCanvas');
  const scoreDisplay = document.getElementById('snakeGameScore');

  // Helper to safely get translations
  function t(key, options = {}) {
    if (window.i18next && window.i18next.isInitialized) {
      return window.i18next.t(key, options);
    }
    console.warn(`i18next not ready, using fallback for key: ${key}`);
    const fallback = key.split('.').pop(); // Get last part of the key
    return options.defaultValue || fallback || key;
  }

  if (!canvas || !scoreDisplay) {
    console.error('Snake game canvas or score display not found. Game cannot initialize.');
    return {
      stop: () => console.warn('Cannot stop Snake: Canvas or Score element missing.'),
    };
  }
  console.log('Snake canvas and score display found.');

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get 2D context from canvas. Game cannot initialize.');
    return {
      stop: () => console.warn('Cannot stop Snake: Failed to get context.'),
    };
  }
  console.log('Canvas 2D context obtained.');

  const GRID_SIZE = 20;
  const GRID_WIDTH = canvas.width / GRID_SIZE;
  const GRID_HEIGHT = canvas.height / GRID_SIZE;

  const GameState = {
    IDLE: 'idle',
    PLAYING: 'playing',
    GAME_OVER: 'game_over',
  };
  let currentState = GameState.IDLE;

  let snake, food, dx, dy, score, gameLoopTimeoutId, changingDirection;

  function initGameVariables() {
    console.log('Initializing game variables...');
    snake = [
      { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) },
      { x: Math.floor(GRID_WIDTH / 2) - 1, y: Math.floor(GRID_HEIGHT / 2) },
    ];
    dx = 1;
    dy = 0;
    score = 0;
    changingDirection = false;
    // Use translation for score label
    if (scoreDisplay)
      scoreDisplay.textContent = t('offlineSnake.hud.scoreLabel', {
        score: score,
        defaultValue: `Score: ${score}`,
      });
    spawnFood();
    console.log('Game variables initialized.');
  }

  function spawnFood() {
    while (true) {
      food = {
        x: Math.floor(Math.random() * GRID_WIDTH),
        y: Math.floor(Math.random() * GRID_HEIGHT),
      };
      let collision = false;
      if (snake) {
        for (const segment of snake) {
          if (segment.x === food.x && segment.y === food.y) {
            collision = true;
            break;
          }
        }
      }
      if (!collision) {
        break;
      }
    }
  }

  function drawRect(x, y, color, isHead = false) {
    try {
      ctx.fillStyle = color;
      ctx.fillRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
      ctx.fillStyle = isHead ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x * GRID_SIZE + 1, y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(x * GRID_SIZE + 2, y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
      if (isHead) {
        ctx.fillStyle = '#FFF';
        const eyeSize = GRID_SIZE / 6;
        let eyeX = x * GRID_SIZE + GRID_SIZE / 2;
        let eyeY = y * GRID_SIZE + GRID_SIZE / 2;
        if (dx === 1) eyeX += eyeSize;
        else if (dx === -1) eyeX -= eyeSize;
        if (dy === 1) eyeY += eyeSize;
        else if (dy === -1) eyeY -= eyeSize;
        ctx.fillRect(eyeX - eyeSize / 2, eyeY - eyeSize / 2, eyeSize, eyeSize);
      }
    } catch (e) {
      console.error('Error during drawRect:', e);
    }
  }

  function drawSnake() {
    if (!snake) return;
    snake.forEach((segment, index) => {
      const color = index === 0 ? '#00cc00' : '#00aa00';
      drawRect(segment.x, segment.y, color, index === 0);
    });
  }

  function drawFood() {
    if (!food) return;
    drawRect(food.x, food.y, '#ff4444');
  }

  function moveSnake() {
    if (!snake || snake.length === 0) return;
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    snake.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      score++;
      // Use translation for score label
      if (scoreDisplay)
        scoreDisplay.textContent = t('offlineSnake.hud.scoreLabel', {
          score: score,
          defaultValue: `Score: ${score}`,
        });
      spawnFood();
      if (snake.length === GRID_WIDTH * GRID_HEIGHT) {
        gameOver(true);
        return;
      }
    } else {
      snake.pop();
    }
  }

  function checkCollision() {
    if (!snake || snake.length === 0) return false;
    const head = snake[0];
    if (head.x < 0 || head.x >= GRID_WIDTH || head.y < 0 || head.y >= GRID_HEIGHT) {
      return true;
    }
    for (let i = 1; i < snake.length; i++) {
      if (head.x === snake[i].x && head.y === snake[i].y) {
        return true;
      }
    }
    return false;
  }

  function clearCanvas() {
    try {
      ctx.fillStyle = '#100a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } catch (e) {
      console.error('Error clearing canvas:', e);
    }
  }

  function gameLoop() {
    if (currentState !== GameState.PLAYING) {
      return;
    }
    if (gameLoopTimeoutId) clearTimeout(gameLoopTimeoutId);
    changingDirection = false;
    moveSnake();
    if (checkCollision()) {
      gameOver(false);
      return;
    }
    clearCanvas();
    drawFood();
    drawSnake();
    gameLoopTimeoutId = setTimeout(gameLoop, 220); // Keep slowed down speed
  }

  function changeDirection(event) {
    if (currentState !== GameState.PLAYING || changingDirection) return;
    const keyPressed = event.code;
    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;
    let directionChanged = false;
    if (
      (keyPressed === 'ArrowLeft' || keyPressed === 'KeyA' || keyPressed === 'KeyQ') &&
      !goingRight
    ) {
      dx = -1;
      dy = 0;
      directionChanged = true;
    }
    if (
      (keyPressed === 'ArrowUp' || keyPressed === 'KeyW' || keyPressed === 'KeyZ') &&
      !goingDown
    ) {
      dx = 0;
      dy = -1;
      directionChanged = true;
    }
    if ((keyPressed === 'ArrowRight' || keyPressed === 'KeyD') && !goingLeft) {
      dx = 1;
      dy = 0;
      directionChanged = true;
    }
    if ((keyPressed === 'ArrowDown' || keyPressed === 'KeyS') && !goingUp) {
      dx = 0;
      dy = 1;
      directionChanged = true;
    }
    if (directionChanged) {
      changingDirection = true;
    }
  }

  function gameOver(win) {
    console.log('Game Over. Win:', win);
    if (gameLoopTimeoutId) clearTimeout(gameLoopTimeoutId);
    gameLoopTimeoutId = null;
    currentState = GameState.GAME_OVER;
    try {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 24px 'Courier New', monospace";
      ctx.fillStyle = win ? '#0f0' : '#f00';
      ctx.textAlign = 'center';
      ctx.shadowColor = win ? '#0f0' : '#f00';
      ctx.shadowBlur = 5;
      // Use translations for game over text
      ctx.fillText(
        win
          ? t('offlineSnake.gameOver.win', { defaultValue: 'WIN!' })
          : t('offlineSnake.gameOver.lose', { defaultValue: 'LOSE!' }),
        canvas.width / 2,
        canvas.height / 2 - 20
      );
      ctx.shadowBlur = 0;
      ctx.font = "16px 'Courier New', monospace";
      ctx.fillStyle = '#fff';
      ctx.fillText(
        t('offlineSnake.gameOver.scoreLabel', {
          score: score,
          defaultValue: `Score: ${score}`,
        }),
        canvas.width / 2,
        canvas.height / 2 + 10
      );
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = '#ccc';
      ctx.fillText(
        t('offlineSnake.gameOver.promptLine1', {
          defaultValue: 'Press Enter',
        }),
        canvas.width / 2,
        canvas.height / 2 + 35
      );
      ctx.fillText(
        t('offlineSnake.gameOver.promptLine2', {
          defaultValue: 'to Play Again',
        }),
        canvas.width / 2,
        canvas.height / 2 + 50
      );
    } catch (e) {
      console.error('Error drawing game over screen:', e);
    }
  }

  function start() {
    if (currentState === GameState.PLAYING) {
      console.log('Game already playing, ignoring start command.');
      return;
    }
    console.log('Starting offline snake game...');
    initGameVariables();
    currentState = GameState.PLAYING;

    let countdown = 3;
    const countdownInterval = setInterval(() => {
      clearCanvas();
      ctx.font = "bold 24px 'Courier New', monospace";
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      // Use translation for countdown
      ctx.fillText(
        t('offlineSnake.countdown', {
          count: countdown,
          defaultValue: `STARTING IN ${countdown}`,
        }),
        canvas.width / 2,
        canvas.height / 2
      );
      countdown--;

      if (countdown < 0) {
        clearInterval(countdownInterval);
        gameLoop();
      }
    }, 1000);
  }

  function stop() {
    console.log('Stopping offline snake game...');
    if (gameLoopTimeoutId) {
      clearTimeout(gameLoopTimeoutId);
      gameLoopTimeoutId = null;
    }
    currentState = GameState.IDLE;
    if (typeof handleKeyPress === 'function') {
      document.removeEventListener('keydown', handleKeyPress);
      console.log('Keydown listener removed.');
    }
    showStartScreen();
  }

  function showStartScreen() {
    console.log('Showing start screen...');
    clearCanvas();
    try {
      ctx.font = "bold 18px 'Courier New', monospace";
      ctx.fillStyle = '#eee';
      ctx.textAlign = 'center';
      // Use translations for start screen text
      ctx.fillText(
        t('offlineSnake.startScreen.title', { defaultValue: 'SNAKE' }),
        canvas.width / 2,
        canvas.height / 2 - 20
      );
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillStyle = '#ccc';
      ctx.fillText(
        t('offlineSnake.startScreen.promptLine1', {
          defaultValue: 'Press Enter',
        }),
        canvas.width / 2,
        canvas.height / 2 + 10
      );
      ctx.fillText(
        t('offlineSnake.startScreen.promptLine2', {
          defaultValue: 'to Play',
        }),
        canvas.width / 2,
        canvas.height / 2 + 30
      );
      console.log('Start screen drawn.');
    } catch (e) {
      console.error('Error drawing start screen:', e);
    }
  }

  function handleKeyPress(event) {
    const ENTER_KEY_CODE = 'Enter';
    if (event.code === ENTER_KEY_CODE) {
      if (currentState === GameState.IDLE || currentState === GameState.GAME_OVER) {
        start();
      }
    } else {
      if (currentState === GameState.PLAYING) {
        changeDirection(event);
      }
    }
  }

  function initialize() {
    if (!canvas || !ctx) {
      console.error('Snake game canvas or context not found during initialization.');
      return;
    }
    console.log('Initializing offline snake game UI...');
    document.addEventListener('keydown', handleKeyPress);
    console.log('Keydown listener added.');
    showStartScreen();
    currentState = GameState.IDLE;
    console.log('Snake game UI initialized, state:', currentState);
  }

  // Initialize only after i18next is ready (or immediately if already ready)
  if (window.i18next && window.i18next.isInitialized) {
    initialize();
  } else if (window.i18next) {
    window.i18next.on('initialized', initialize);
  } else {
    // Fallback if i18next isn't even loaded on the page
    console.warn('i18next not found, initializing Snake game immediately with fallback text.');
    document.addEventListener('DOMContentLoaded', initialize);
  }

  return {
    stop: stop,
  };
})();

window.stopOfflineSnakeGame = snakeGame.stop;
