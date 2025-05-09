// --- backend/collisionWorker.js ---
/**
 * ==============================================================================
 * FILE: collisionWorker.js
 *
 * DESCRIPTION:
 * Dedicated worker thread responsible for performing computationally intensive
 * head-vs-body collision checks between players using point-segment distance logic.
 * Receives tasks from the main thread and posts back results.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Optimize calculations for performance as this runs in parallel.
 * ==============================================================================
 */

// Runs in a separate Node.js worker thread context.

const { parentPort, threadId } = require("worker_threads");

// --- Helper Functions for Vector Math ---

/** Calculates the squared distance between two points {x, y}. */
function distanceSquared(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

/** Calculates the dot product of two vectors {x, y}. */
function dotProduct(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y;
}

/** Subtracts vector v2 from v1. */
function subtractVectors(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
}

/**
 * Calculates the squared distance from a point (p) to a line segment (a, b).
 * @param {object} p - The point {x, y}.
 * @param {object} a - The start point of the segment {x, y}.
 * @param {object} b - The end point of the segment {x, y}.
 * @returns {number} The squared distance.
 */
function pointSegmentDistanceSquared(p, a, b) {
  const l2 = distanceSquared(a, b);
  // If the segment has zero length, return distance squared to point 'a'
  if (l2 < 0.000001) return distanceSquared(p, a);

  // Consider the line extending the segment, parameterized as a + t (b - a).
  // We find projection of point p onto the line.
  // It falls where t = [(p-a) . (b-a)] / |b-a|^2
  const t = dotProduct(subtractVectors(p, a), subtractVectors(b, a)) / l2;

  // Clamp t to the [0, 1] interval to handle points outside the segment ends
  const clampedT = Math.max(0, Math.min(1, t));

  // Calculate the closest point on the segment
  const closestPoint = {
    x: a.x + clampedT * (b.x - a.x),
    y: a.y + clampedT * (b.y - a.y),
  };

  // Return the squared distance between the point and the closest point on the segment
  return distanceSquared(p, closestPoint);
}


/**
 * Checks for collision between a player's head and opponent trails using point-segment logic.
 * @param {object} data - The data received from the main thread.
 * @param {string} data.playerId - The ID of the player to check.
 * @param {number} data.playerX - The X coordinate of the player's head.
 * @param {number} data.playerY - The Y coordinate of the player's head.
 * @param {Array<object>} data.opponents - Array of opponent data.
 * @param {string} opponent.id - Opponent's ID.
 * @param {Array<object>} opponent.trail - Opponent's trail segments ({x, y}).
 * @param {object} data.config - Configuration values.
 * @param {number} data.config.COLLISION_RADIUS - The radius for collision checks.
 */
function checkPlayerCollisions(data) {
  const { playerId, playerX, playerY, opponents, config } = data;
  const collisionRadius = config.COLLISION_RADIUS;
  const collisionRadiusSq = collisionRadius * collisionRadius;
  const playerHead = { x: playerX, y: playerY };

  // console.log(`[Worker ${threadId}] Checking player ${playerId} at (${playerX.toFixed(1)}, ${playerY.toFixed(1)}) vs ${opponents.length} opponents. Radius: ${collisionRadius} (Point-Segment)`);

  for (const opponent of opponents) {
    const trail = opponent.trail;

    // Need at least 2 points to form a segment
    if (!trail || trail.length < 2) {
      continue;
    }

    // Iterate through trail segments (from tail towards head)
    for (let i = 0; i < trail.length - 1; i++) {
      const p1 = trail[i];
      const p2 = trail[i + 1];

      // Validate segment points
      if (
        !p1 || typeof p1.x !== 'number' || typeof p1.y !== 'number' ||
        !p2 || typeof p2.x !== 'number' || typeof p2.y !== 'number'
      ) {
         console.warn(`[Worker ${threadId}] Invalid segment data at indices ${i}, ${i+1} for opponent ${opponent.id}.`);
         continue;
      }

      // Calculate squared distance from player's head to the current trail segment
      const distSq = pointSegmentDistanceSquared(playerHead, p1, p2);

      // console.log(`[Worker ${threadId}] Checking seg ${i}-${i+1}: distSq=${distSq.toFixed(1)} vs collisionRadiusSq=${collisionRadiusSq.toFixed(1)}`); // DEBUG LOG

      // Check for collision
      if (distSq < collisionRadiusSq) {
        console.log(`[Worker ${threadId}] COLLISION DETECTED! Player ${playerId} hit trail segment ${i}-${i+1} of ${opponent.id}. DistSq: ${distSq.toFixed(1)} < RadiusSq: ${collisionRadiusSq.toFixed(1)}`);
        return {
          playerId: playerId,
          collision: {
            reason: "Your head has touched another player's body.",
            isKill: true,
            killerId: opponent.id,
          },
          threadId: threadId,
        };
      }
    }
  }

  // No collision found
  return {
    playerId: playerId,
    collision: null,
    threadId: threadId,
  };
}


parentPort.on("message", (taskData) => {
  try {
    const result = checkPlayerCollisions(taskData);
    parentPort.postMessage(result);
  } catch (error) {
    console.error(`Worker ${threadId} error processing task:`, error);
    // Optionally send an error message back to the main thread
    parentPort.postMessage({
      playerId: taskData.playerId,
      error: error.message,
      threadId: threadId,
    });
  }
});

// console.log(`Worker ${threadId} started.`);
