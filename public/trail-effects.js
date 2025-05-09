// --- public/trail-effects.js ---
/**
 * ==============================================================================
 * FILE: trail-effects.js
 *
 * DESCRIPTION:
 * Defines and exports functions for generating particle data for various visual
 * trail effects (sparkle, smoke, fire, glitch, etc.). Each function calculates
 * initial particle properties (position variance, velocity, lifespan, color, size)
 * based on the effect type and player data. Used by game-main.js to spawn particles.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Add new effects by creating a new spawn function and registering it in the 'effects' object.
 * ==============================================================================
 */

const TrailEffects = (() => {
    // Constants (can be adjusted or passed if needed)
    const PARTICLE_LIFESPAN = 800; // Default lifespan
    const PARTICLE_FADE_DURATION = 300; // Should match renderer if used there
  
    // --- Internal Helper Functions ---
  
    function randomRange(min, max) {
      return Math.random() * (max - min) + min;
    }
  
    /**
     * Converts a hex color string to an array of normalized RGB values [r, g, b].
     * @param {string} hex - The hex color string (e.g., "#ff0000").
     * @returns {Array<number>} An array [r, g, b] with values between 0 and 1.
     */
    function hexToRgbNormalizedInternal(hex) {
      let r = 0, g = 0, b = 0;
      if (!hex) return [0, 0, 0]; // Return black for invalid input
  
      // Handle shorthand hex (#rgb)
      if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
      }
      // Handle full hex (#rrggbb)
      else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
      }
  
      // Normalize to 0-1 range
      return [r / 255, g / 255, b / 255];
    }
  
  
    // --- Base Effects ---
  
    function spawnNone() { return null; }
  
    function spawnSparkle(player, x, y, currentTime) {
      const particleSize = randomRange(1, 3);
      const particleLife = randomRange(400, 800);
      const particleSpeed = randomRange(10, 30);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * particleSpeed;
      const vy = Math.sin(angle) * particleSpeed;
      const hue = randomRange(200, 260);
      const particleColor = `hsl(${hue}, 100%, 70%)`;
      return {
        x: x + randomRange(-2, 2), y: y + randomRange(-2, 2),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 1, type: "sparkle", color: particleColor, size: particleSize,
      };
    }
  
    function spawnSmoke(player, x, y, currentTime) {
      const particleSize = randomRange(3, 7);
      const particleLife = randomRange(600, 1100);
      const particleSpeed = randomRange(5, 15);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * particleSpeed * 0.5;
      const vy = Math.sin(angle) * particleSpeed - randomRange(5, 10);
      const particleColor = "rgba(0, 255, 100, 0.4)";
      return {
        x: x + randomRange(-3, 3), y: y + randomRange(-3, 3),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 1, type: "smoke", color: particleColor, size: particleSize,
      };
    }
  
    // --- New Effects ---
  
    function spawnFire(player, x, y, currentTime) {
      const particleSize = randomRange(2, 5);
      const particleLife = randomRange(500, 900);
      const particleSpeed = randomRange(5, 20);
      const angle = randomRange(-Math.PI * 0.1, Math.PI * 0.1) - Math.PI / 2;
      const vx = Math.cos(angle) * particleSpeed;
      const vy = Math.sin(angle) * particleSpeed;
      const hue = randomRange(0, 50);
      const saturation = randomRange(90, 100);
      const lightness = randomRange(50, 70);
      const particleColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      return {
        x: x + randomRange(-2, 2), y: y + randomRange(-2, 2),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 1, type: "fire", color: particleColor, size: particleSize,
      };
    }
  
    function spawnIceShards(player, x, y, currentTime) {
      const particleSize = randomRange(1.5, 4);
      const particleLife = randomRange(300, 600);
      const particleSpeed = randomRange(20, 40);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * particleSpeed;
      const vy = Math.sin(angle) * particleSpeed;
      const hue = randomRange(180, 220);
      const saturation = randomRange(70, 100);
      const lightness = randomRange(70, 90);
      const particleColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      return {
        x: x + randomRange(-1, 1), y: y + randomRange(-1, 1),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 0.9, type: "ice", color: particleColor, size: particleSize,
      };
    }
  
    function spawnElectricSparks(player, x, y, currentTime) {
      const particleSize = randomRange(1, 2.5);
      const particleLife = randomRange(100, 300);
      const particleSpeed = randomRange(40, 80);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * particleSpeed;
      const vy = Math.sin(angle) * particleSpeed;
      const particleColor = Math.random() > 0.3 ? "#FFFFFF" : "#FFFF80";
      return {
        x: x + randomRange(-1, 1), y: y + randomRange(-1, 1),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 1, type: "electric", color: particleColor, size: particleSize,
      };
    }
  
    function spawnRainbow(player, x, y, currentTime) {
      const particleSize = randomRange(2, 4);
      const particleLife = randomRange(600, 1000);
      const particleSpeed = randomRange(10, 25);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * particleSpeed;
      const vy = Math.sin(angle) * particleSpeed;
      const hue = Math.random() * 360;
      const particleColor = `hsl(${hue}, 100%, 60%)`;
      return {
        x: x + randomRange(-2, 2), y: y + randomRange(-2, 2),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 0.9, type: "rainbow", color: particleColor, size: particleSize,
      };
    }
  
    function spawnBubbles(player, x, y, currentTime) {
      const particleSize = randomRange(3, 8);
      const particleLife = randomRange(800, 1500);
      const particleSpeed = randomRange(2, 8);
      const angle = randomRange(-Math.PI * 0.2, Math.PI * 0.2) - Math.PI / 2;
      const vx = Math.cos(angle) * particleSpeed + randomRange(-3, 3);
      const vy = Math.sin(angle) * particleSpeed * randomRange(1, 3);
      const baseColor = player?.headColor || "#FFFFFF";
      // Use the internal helper function now
      const [r, g, b] = hexToRgbNormalizedInternal(baseColor);
      const particleColor = `rgba(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)}, 0.3)`;
      return {
        x: x + randomRange(-3, 3), y: y + randomRange(-3, 3),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 1, type: "bubble", color: particleColor, size: particleSize,
      };
    }
  
    function spawnGlitch(player, x, y, currentTime) {
      const particleSize = randomRange(1.5, 3.5);
      const particleLife = randomRange(150, 400);
      const particleSpeed = randomRange(15, 35);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * particleSpeed;
      const vy = Math.sin(angle) * particleSpeed;
      const glitchColors = ["#FF1E56", "#39FF14", "#1AF0DC", "#FF00E1"];
      const particleColor = glitchColors[Math.floor(Math.random() * glitchColors.length)];
      return {
        x: x + randomRange(-1, 1), y: y + randomRange(-1, 1),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 1, type: "glitch", color: particleColor, size: particleSize,
      };
    }
  
    function spawnVoid(player, x, y, currentTime) {
      const particleSize = randomRange(4, 8);
      const particleLife = randomRange(700, 1200);
      const particleSpeed = randomRange(3, 10);
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * particleSpeed;
      const vy = Math.sin(angle) * particleSpeed;
      const lightness = randomRange(5, 15);
      const hue = randomRange(240, 300);
      const particleColor = `hsl(${hue}, 50%, ${lightness}%)`;
      return {
        x: x + randomRange(-4, 4), y: y + randomRange(-4, 4),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 0.7, type: "void", color: particleColor, size: particleSize,
      };
    }
  
    function spawnConfetti(player, x, y, currentTime) {
      const particleSize = randomRange(2, 5);
      const particleLife = randomRange(1000, 1800);
      const particleSpeed = randomRange(5, 15);
      const angle = randomRange(Math.PI * 0.4, Math.PI * 0.6);
      const vx = Math.cos(angle) * particleSpeed + randomRange(-5, 5);
      const vy = Math.sin(angle) * particleSpeed * randomRange(0.5, 1.5);
      const hue = Math.random() * 360;
      const particleColor = `hsl(${hue}, 90%, 65%)`;
      return {
        x: x + randomRange(-3, 3), y: y + randomRange(-3, 3),
        vx: vx, vy: vy, life: particleLife, spawnTime: currentTime,
        opacity: 1, type: "confetti", color: particleColor, size: particleSize,
      };
    }
  
    // --- Register Effects ---
    const effects = {
      none: spawnNone,
      sparkle: spawnSparkle,
      smoke: spawnSmoke,
      fire: spawnFire,
      ice: spawnIceShards,
      electric: spawnElectricSparks,
      rainbow: spawnRainbow,
      bubbles: spawnBubbles,
      glitch: spawnGlitch,
      void: spawnVoid,
      confetti: spawnConfetti,
    };
  
    // --- Public Interface ---
    return {
      getSpawnFunction: function (effectName) {
        return effects[effectName] || null;
      },
      spawnParticle: function (effectName, player, x, y, currentTime) {
        const spawnFunc = this.getSpawnFunction(effectName);
        if (spawnFunc) {
          return spawnFunc(player, x, y, currentTime);
        }
        console.warn(`[TrailEffects] Unknown effect name: ${effectName}`);
        return null;
      },
    };
  })();
  
  // Assign to window for global access
  window.TrailEffects = TrailEffects;
  