// --- public/game-renderer.js ---
/**
 * ==============================================================================
 * FILE: game-renderer.js
 *
 * DESCRIPTION:
 * Handles rendering the game state (players, food, background, particles, border)
 * and the minimap using WebGL via WebGLUtils. Manages the main rendering loop
 * called by game-main.js. Also responsible for drawing the 2D text overlay (names).
 * Includes visual indicator for god mode (pulsating glow).
 * Uses i18next for any potential user-facing text (currently minimal).
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Optimize WebGL calls for performance (batching, minimizing state changes if possible).
 * ==============================================================================
 */

// Depends on WebGLUtils being loaded first.
// Assumes global 'i18next' instance is available and initialized.
// Assumes global 'config' object might be available or passed for GODMODE_DURATION

const GameRenderer = (() => {
  // Constants for particle effects
  const PARTICLE_LIFESPAN = 800;
  const PARTICLE_FADE_DURATION = 300;
  const MAX_PARTICLES_PER_PLAYER = 100; // Limit particles per player
  const GODMODE_GLOW_OFFSET = 2.0; // Extra size for the glow effect
  const GODMODE_PULSE_SPEED = 3.0; // Speed of the glow pulsation
  const GODMODE_MIN_ALPHA = 0.3; // Minimum alpha for the glow
  const GODMODE_MAX_ALPHA = 0.8; // Maximum alpha for the glow
  const GODMODE_GLOW_COLOR = [1.0, 1.0, 0.8, 1.0]; // Base color (Gold-ish White)

  // --- i18next Helper ---

  // --- Helper Functions (Internal) ---
  function calculateHashCode(str) {
    var hash = 0,
      i,
      chr;
    if (!str || str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
      chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // --- Particle Drawing ---
  function drawParticles(gl, shaderPrograms, buffers, projectionMatrix, zoomLevel, gameState) {
    if (!gameState.players) return;

    const programInfo = shaderPrograms.color;
    if (!programInfo || !programInfo.program || !buffers.quad) return;

    gl.useProgram(programInfo.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive blending for particles

    let modelMatrix = WebGLUtils.getModelMatrix();

    for (const id in gameState.players) {
      const p = gameState.players[id];
      if (!p || !p.particles || p.particles.length === 0) continue;

      for (const particle of p.particles) {
        let r = 1,
          g = 1,
          b = 1,
          a = particle.opacity;
        try {
          if (particle.color.startsWith('rgba')) {
            const parts = particle.color.match(/[\d.]+/g);
            if (parts && parts.length === 4) {
              r = parseFloat(parts[0]) / 255;
              g = parseFloat(parts[1]) / 255;
              b = parseFloat(parts[2]) / 255;
              a *= parseFloat(parts[3]);
            }
          } else if (particle.color.startsWith('#')) {
            [r, g, b] = WebGLUtils.hexToRgbNormalized(particle.color);
          } else if (particle.color.startsWith('hsl')) {
            // Basic HSL parsing needed if used by effects
            // For now, assume hex/rgba
          }
        } catch {
          /* Ignore color parse errors */
        }

        WebGLUtils.identityMatrix(modelMatrix);
        WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [particle.x, particle.y]);
        const particleScreenSize = particle.size / zoomLevel; // Adjust particle size based on zoom
        WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [particleScreenSize, particleScreenSize]);

        let mvpMatrix = WebGLUtils.createMatrix();
        WebGLUtils.multiplyMatrices(mvpMatrix, projectionMatrix, modelMatrix);

        gl.uniformMatrix4fv(programInfo.uniformLocations.mvpMatrix, false, mvpMatrix);
        // Apply particle alpha and potentially a base multiplier for effect
        gl.uniform4f(programInfo.uniformLocations.color, r, g, b, a * 0.8);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      }
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // Restore standard blending
  }

  // --- Text Overlay Drawing ---
  function drawTextOverlay(
    ctx,
    canvas,
    gameState,
    cameraX,
    cameraY,
    zoomLevel,
    localMyId,
    selectedPlayerId
  ) {
    if (!ctx || !canvas || !gameState || !gameState.players) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    for (let id in gameState.players) {
      let p = gameState.players[id];
      if (!p || p.isGhost) continue; // Don't draw text for ghosts

      // Calculate screen position based on camera and zoom
      const viewX = p.x - cameraX;
      const viewY = p.y - cameraY;
      const screenX = canvas.width / 2 + viewX * zoomLevel;
      const screenY = canvas.height / 2 + viewY * zoomLevel;

      // Basic culling: Don't draw if too far off-screen
      if (
        screenX < -100 ||
        screenX > canvas.width + 100 ||
        screenY < -100 ||
        screenY > canvas.height + 100
      ) {
        continue;
      }

      // Calculate approximate head radius on screen for positioning text above it
      const baseRadius = 3;
      const sizeFactor = Math.log10(Math.max(10, p.maxTrailLength || 10));
      const maxAdditionalRadius = 8;
      let additionalRadius = Math.min(maxAdditionalRadius, Math.floor(sizeFactor * 2.5));
      let segmentRadius = baseRadius + additionalRadius;
      let headRadius = segmentRadius * 1.3;
      const headRadiusScreen = headRadius * zoomLevel;

      // --- Draw Player Name ---
      const fontSize = 12; // Base font size
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textWidth = ctx.measureText(p.name).width;
      const nameY = screenY - headRadiusScreen - 10; // Position above head

      // Background rectangle for name
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(
        screenX - textWidth / 2 - 4,
        nameY - fontSize / 2 - 2,
        textWidth + 8,
        fontSize + 4
      );

      // Name text style
      ctx.fillStyle = p.isFrozen ? 'rgba(150, 150, 200, 0.9)' : 'rgba(255, 255, 255, 0.9)';
      if (id === selectedPlayerId) {
        // Highlight if selected in ghost mode
        ctx.fillStyle = 'rgba(255, 255, 0, 1)'; // Yellow
        ctx.shadowColor = 'yellow';
        ctx.shadowBlur = 5;
      }
      ctx.fillText(p.name, screenX, nameY);
      ctx.shadowColor = 'transparent'; // Reset shadow
      ctx.shadowBlur = 0;

      // --- Draw Frozen Indicator ---
      if (p.isFrozen) {
        ctx.font = `${fontSize + 4}px Arial`; // Slightly larger emoji
        ctx.fillStyle = 'rgba(100, 100, 255, 0.9)'; // Blueish
        ctx.fillText('❄️', screenX, nameY + fontSize + 2); // Position below name
      }
    }
    ctx.restore();
  }

  // --- Minimap Drawing Helper ---
  function drawScreenQuad(
    gl,
    shaderPrograms,
    screenX,
    screenY,
    screenWidth,
    screenHeight,
    color,
    projMatrix
  ) {
    const programInfo = shaderPrograms.color;
    if (!programInfo || !programInfo.program) return;

    let modelMatrix = WebGLUtils.getModelMatrix(); // Use the reusable model matrix

    WebGLUtils.identityMatrix(modelMatrix);
    // Translate to center, then scale
    WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [
      screenX + screenWidth / 2,
      screenY + screenHeight / 2,
    ]);
    WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [screenWidth, screenHeight]);

    let mvpMatrix = WebGLUtils.createMatrix(); // Create a temporary MVP matrix
    WebGLUtils.multiplyMatrices(mvpMatrix, projMatrix, modelMatrix); // P * M (View is identity for screen space)

    gl.uniformMatrix4fv(programInfo.uniformLocations.mvpMatrix, false, mvpMatrix);
    gl.uniform4fv(programInfo.uniformLocations.color, color); // Pass color as vec4
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4); // Draw the quad
  }

  // --- Minimap Drawing ---
  function drawMinimapWebGL(
    gl,
    canvas,
    shaderPrograms,
    buffers,
    gameState,
    localMyId,
    cameraX,
    cameraY,
    zoomLevel,
    worldWidth,
    worldHeight,
    mapShape
  ) {
    if (!gl || !canvas || !shaderPrograms.color || !buffers.quad) return;

    const programInfo = shaderPrograms.color;
    gl.useProgram(programInfo.program);

    // --- Setup Screen Space Projection ---
    // This matrix maps screen coordinates (0,0 top-left to width,height bottom-right) to WebGL clip space (-1 to 1)
    let screenProjectionMatrix = WebGLUtils.createMatrix();
    WebGLUtils.orthoMatrix(screenProjectionMatrix, 0, canvas.width, canvas.height, 0, -1, 1); // Note: Y is flipped (0 at top)

    // --- Minimap Position and Size ---
    const mapSize = 150; // Desired minimap size in pixels
    const margin = 15; // Margin from screen edges
    const mapX = margin;
    const mapY = margin; // Position top-left

    // --- Bind Quad Buffer ---
    // We reuse the simple quad buffer for all minimap elements
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);

    // --- Draw Background ---
    const bgColor = [0.2, 0.2, 0.2, 0.7]; // Semi-transparent dark grey
    drawScreenQuad(
      gl,
      shaderPrograms,
      mapX,
      mapY,
      mapSize,
      mapSize,
      bgColor,
      screenProjectionMatrix
    );

    // --- Draw Border ---
    const borderColor = [0.8, 0.8, 0.8, 0.5]; // Semi-transparent light grey
    const borderWidth = 2.0; // Border thickness in pixels

    if (mapShape === 'circle') {
      // Draw circle border (approximated with quads or line loop if preferred)
      // For simplicity, we'll stick to the rectangular border for now.
      // A proper circle border would require a dedicated buffer or shader.
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX,
        mapY,
        mapSize,
        borderWidth,
        borderColor,
        screenProjectionMatrix
      ); // Top
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX,
        mapY + mapSize - borderWidth,
        mapSize,
        borderWidth,
        borderColor,
        screenProjectionMatrix
      ); // Bottom
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX,
        mapY,
        borderWidth,
        mapSize,
        borderColor,
        screenProjectionMatrix
      ); // Left
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX + mapSize - borderWidth,
        mapY,
        borderWidth,
        mapSize,
        borderColor,
        screenProjectionMatrix
      ); // Right
    } else {
      // Rectangle
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX,
        mapY,
        mapSize,
        borderWidth,
        borderColor,
        screenProjectionMatrix
      ); // Top
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX,
        mapY + mapSize - borderWidth,
        mapSize,
        borderWidth,
        borderColor,
        screenProjectionMatrix
      ); // Bottom
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX,
        mapY,
        borderWidth,
        mapSize,
        borderColor,
        screenProjectionMatrix
      ); // Left
      drawScreenQuad(
        gl,
        shaderPrograms,
        mapX + mapSize - borderWidth,
        mapY,
        borderWidth,
        mapSize,
        borderColor,
        screenProjectionMatrix
      ); // Right
    }

    // --- Draw Player Dots ---
    const scaleX = mapSize / worldWidth;
    const scaleY = mapSize / worldHeight;
    const dotSize = 3; // Size of opponent dots

    for (let id in gameState.players) {
      if (id === localMyId) continue; // Skip self for now
      const p = gameState.players[id];
      if (!p || p.isGhost) continue; // Skip ghosts

      // Calculate position on minimap (Y needs flipping)
      const minimapPosX = mapX + p.x * scaleX;
      const minimapPosY = mapY + p.y * scaleY; // Y is flipped relative to world

      // Clamp position within minimap boundaries
      const clampedX = Math.max(
        mapX + dotSize / 2,
        Math.min(mapX + mapSize - dotSize / 2, minimapPosX)
      );
      const clampedY = Math.max(
        mapY + dotSize / 2,
        Math.min(mapY + mapSize - dotSize / 2, minimapPosY)
      );

      // Determine dot color based on type/state
      let dotColor =
        p.type === 'bot'
          ? [0.5, 0.5, 0.5, 0.9] // Grey for bots
          : p.isFrozen
            ? [0.0, 1.0, 1.0, 0.9] // Cyan for frozen
            : [1.0, 0.0, 0.0, 0.9]; // Red for other players

      drawScreenQuad(
        gl,
        shaderPrograms,
        clampedX - dotSize / 2,
        clampedY - dotSize / 2,
        dotSize,
        dotSize,
        dotColor,
        screenProjectionMatrix
      );
    }

    // --- Draw Self Dot ---
    const self = gameState.players[localMyId];
    if (self && !self.isGhost) {
      const selfDotSize = 5; // Make self dot slightly larger
      const selfMinimapPosX = mapX + self.x * scaleX;
      const selfMinimapPosY = mapY + self.y * scaleY; // Y is flipped
      const selfColor = [0.0, 1.0, 0.0, 1.0]; // Green for self

      // Clamp self position
      const selfClampedX = Math.max(
        mapX + selfDotSize / 2,
        Math.min(mapX + mapSize - selfDotSize / 2, selfMinimapPosX)
      );
      const selfClampedY = Math.max(
        mapY + selfDotSize / 2,
        Math.min(mapY + mapSize - selfDotSize / 2, selfMinimapPosY)
      );

      drawScreenQuad(
        gl,
        shaderPrograms,
        selfClampedX - selfDotSize / 2,
        selfClampedY - selfDotSize / 2,
        selfDotSize,
        selfDotSize,
        selfColor,
        screenProjectionMatrix
      );
    }

    // --- Draw Camera View Rectangle ---
    const viewRectColor = [1.0, 1.0, 1.0, 0.4]; // Semi-transparent white
    const viewRectLineWidth = 1.0; // Line thickness

    // Calculate world coordinates of the camera view edges
    const viewWorldLeft = cameraX - canvas.width / (2 * zoomLevel);
    const viewWorldRight = cameraX + canvas.width / (2 * zoomLevel);
    const viewWorldBottom = cameraY - canvas.height / (2 * zoomLevel); // Lower Y value
    const viewWorldTop = cameraY + canvas.height / (2 * zoomLevel); // Higher Y value

    // Convert world coordinates to minimap coordinates (Y needs flipping)
    const viewMapX = mapX + viewWorldLeft * scaleX;
    const viewMapY = mapY + viewWorldBottom * scaleY; // Use world bottom for top-left Y
    const viewMapWidth = (viewWorldRight - viewWorldLeft) * scaleX;
    const viewMapHeight = (viewWorldTop - viewWorldBottom) * scaleY;

    // Clamp the view rectangle to the minimap boundaries
    const clampedViewX = Math.max(mapX, viewMapX);
    const clampedViewY = Math.max(mapY, viewMapY);
    const clampedViewRight = Math.min(mapX + mapSize, viewMapX + viewMapWidth);
    const clampedViewBottom = Math.min(mapY + mapSize, viewMapY + viewMapHeight);
    const clampedViewWidth = Math.max(0, clampedViewRight - clampedViewX);
    const clampedViewHeight = Math.max(0, clampedViewBottom - clampedViewY);

    // Draw the clamped view rectangle outline using thin quads
    if (clampedViewWidth > 0 && clampedViewHeight > 0) {
      // Top line
      drawScreenQuad(
        gl,
        shaderPrograms,
        clampedViewX,
        clampedViewY,
        clampedViewWidth,
        viewRectLineWidth,
        viewRectColor,
        screenProjectionMatrix
      );
      // Bottom line
      drawScreenQuad(
        gl,
        shaderPrograms,
        clampedViewX,
        clampedViewBottom - viewRectLineWidth,
        clampedViewWidth,
        viewRectLineWidth,
        viewRectColor,
        screenProjectionMatrix
      );
      // Left line
      drawScreenQuad(
        gl,
        shaderPrograms,
        clampedViewX,
        clampedViewY,
        viewRectLineWidth,
        clampedViewHeight,
        viewRectColor,
        screenProjectionMatrix
      );
      // Right line
      drawScreenQuad(
        gl,
        shaderPrograms,
        clampedViewRight - viewRectLineWidth,
        clampedViewY,
        viewRectLineWidth,
        clampedViewHeight,
        viewRectColor,
        screenProjectionMatrix
      );
    }
  }

  // --- Main Drawing Function ---
  function drawGame(
    gl,
    canvas,
    textOverlayCtx,
    textOverlayCanvas,
    shaderPrograms,
    buffers,
    textures,
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
    maybeSpawnParticle
  ) {
    if (!gl || !canvas) return;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- Setup World Space Projection & View ---
    let projectionMatrix = WebGLUtils.getProjectionMatrix();
    let viewMatrix = WebGLUtils.getViewMatrix(); // View matrix is usually identity unless camera rotates/tilts
    let modelMatrix = WebGLUtils.getModelMatrix(); // Reusable model matrix

    // Calculate world coordinates visible in the viewport based on camera and zoom
    const left = cameraX - canvas.width / (2 * zoomLevel);
    const right = cameraX + canvas.width / (2 * zoomLevel);
    const bottom = cameraY - canvas.height / (2 * zoomLevel); // World Y increases upwards
    const top = cameraY + canvas.height / (2 * zoomLevel);
    WebGLUtils.orthoMatrix(projectionMatrix, left, right, bottom, top, -1, 1); // Set projection
    WebGLUtils.identityMatrix(viewMatrix); // Keep view matrix as identity for 2D top-down

    // --- Draw Background (Grid Shader) ---
    const gridProgramInfo = shaderPrograms.grid;
    if (gridProgramInfo && gridProgramInfo.program && buffers.quad) {
      gl.useProgram(gridProgramInfo.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
      gl.vertexAttribPointer(gridProgramInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(gridProgramInfo.attribLocations.position);

      const gridSize = 50.0; // Size of grid squares in world units
      const lineThickness = 1.5 / zoomLevel; // Make lines thinner when zoomed out
      const bgColor = [0.1, 0.06, 0.12, 1.0]; // Dark purple
      const lineColor = [0.23, 0.18, 0.29, 1.0]; // Lighter purple

      gl.uniform4f(
        gridProgramInfo.uniformLocations.bgColor,
        bgColor[0],
        bgColor[1],
        bgColor[2],
        bgColor[3]
      );
      gl.uniform4f(
        gridProgramInfo.uniformLocations.lineColor,
        lineColor[0],
        lineColor[1],
        lineColor[2],
        lineColor[3]
      );
      gl.uniform1f(gridProgramInfo.uniformLocations.gridSize, gridSize);
      gl.uniform1f(gridProgramInfo.uniformLocations.lineThickness, lineThickness);

      // Draw a single large quad covering the visible area for the grid shader
      // The shader calculates world coords based on vertex position relative to this quad
      const viewWidth = right - left;
      const viewHeight = top - bottom;
      gl.uniform2f(gridProgramInfo.uniformLocations.quadScale, viewWidth, viewHeight);
      gl.uniform2f(gridProgramInfo.uniformLocations.quadOffset, left, bottom);

      WebGLUtils.identityMatrix(modelMatrix);
      WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [cameraX, cameraY]); // Center quad on camera
      WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [viewWidth, viewHeight]); // Scale to view size

      let mvpMatrix = WebGLUtils.createMatrix();
      WebGLUtils.multiplyMatrices(mvpMatrix, projectionMatrix, modelMatrix); // P * M (V is identity)
      gl.uniformMatrix4fv(gridProgramInfo.uniformLocations.mvpMatrix, false, mvpMatrix);

      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    // --- Draw World Border ---
    const baseBorderWidth = 5.0; // Width in world units
    const pulseSpeed = 1.5; // Speed of pulsation
    const minAlpha = 0.5;
    const maxAlpha = 0.9;
    const alphaRange = maxAlpha - minAlpha;
    // Pulsating alpha based on time
    const pulsatingAlpha =
      minAlpha + (alphaRange / 2) * (1 + Math.sin((currentTime / 1000) * pulseSpeed));
    const borderColor = [1.0, 0.1, 0.1, pulsatingAlpha]; // Pulsating red

    if (mapShape === 'circle' && mapRadius > 0) {
      // Draw circle border (using line strip or triangle strip)
      const numSegments = 100; // More segments for smoother circle
      const angleStep = (2 * Math.PI) / numSegments;
      const centerX = worldWidth / 2;
      const centerY = worldHeight / 2;
      const outerRadius = mapRadius + baseBorderWidth / 2;
      const innerRadius = mapRadius - baseBorderWidth / 2;
      const borderVertices = [];
      for (let i = 0; i <= numSegments; i++) {
        const angle = i * angleStep;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        borderVertices.push(centerX + outerRadius * cosA, centerY + outerRadius * sinA);
        borderVertices.push(centerX + innerRadius * cosA, centerY + innerRadius * sinA);
      }
      // Update or create buffer for circle border
      if (!buffers.circleBorder) {
        buffers.circleBorder = WebGLUtils.createBuffer(
          new Float32Array(borderVertices),
          gl.ARRAY_BUFFER,
          gl.DYNAMIC_DRAW
        );
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.circleBorder);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(borderVertices));
      }

      const program = shaderPrograms.color;
      if (program && program.program) {
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.circleBorder);
        gl.vertexAttribPointer(program.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.attribLocations.position);

        WebGLUtils.identityMatrix(modelMatrix); // Model is identity for world space border
        let borderMvpMatrix = WebGLUtils.createMatrix();
        WebGLUtils.multiplyMatrices(borderMvpMatrix, projectionMatrix, modelMatrix); // P * M (V is identity)

        gl.uniformMatrix4fv(program.uniformLocations.mvpMatrix, false, borderMvpMatrix);
        gl.uniform4fv(program.uniformLocations.color, borderColor);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, borderVertices.length / 2); // Use TRIANGLE_STRIP
      }
    } else {
      // Rectangle border
      // Draw 4 quads for the rectangular border
      WebGLUtils.drawQuad(
        worldWidth / 2,
        -baseBorderWidth / 2,
        worldWidth + baseBorderWidth,
        baseBorderWidth,
        borderColor
      ); // Bottom edge
      WebGLUtils.drawQuad(
        worldWidth / 2,
        worldHeight + baseBorderWidth / 2,
        worldWidth + baseBorderWidth,
        baseBorderWidth,
        borderColor
      ); // Top edge
      WebGLUtils.drawQuad(
        -baseBorderWidth / 2,
        worldHeight / 2,
        baseBorderWidth,
        worldHeight + baseBorderWidth,
        borderColor
      ); // Left edge
      WebGLUtils.drawQuad(
        worldWidth + baseBorderWidth / 2,
        worldHeight / 2,
        baseBorderWidth,
        worldHeight + baseBorderWidth,
        borderColor
      ); // Right edge
    }

    // --- Draw Food ---
    if (gameState.food) {
      const program = shaderPrograms.color;
      if (program && program.program && buffers.quad) {
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
        gl.vertexAttribPointer(program.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(program.attribLocations.position);

        const foodAnimSpeed = 1.2;
        const foodAnimScaleRange = 0.2; // How much size changes

        for (let i = 0; i < gameState.food.length; i++) {
          const item = gameState.food[i];
          if (!item) continue;
          // Basic culling for food
          if (
            item.x < left - 50 ||
            item.x > right + 50 ||
            item.y < bottom - 50 ||
            item.y > top + 50
          )
            continue;

          // Calculate pulsating scale and alpha
          const foodAnimTime =
            (currentTime / 1000) * foodAnimSpeed + (calculateHashCode(item.id || 'food') % 10); // Add hash for variation
          const foodScale = 1 + Math.sin(foodAnimTime) * foodAnimScaleRange;
          const foodAlpha = 0.7 + (Math.sin(foodAnimTime) + 1) * 0.15; // Base alpha + pulse
          const finalAlpha = item.opacity * foodAlpha; // Apply expiration fade
          const [r, g, b] = WebGLUtils.hexToRgbNormalized(item.color);

          // Set model matrix for this food item
          WebGLUtils.identityMatrix(modelMatrix);
          WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [item.x, item.y]);
          WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [
            item.size * foodScale,
            item.size * foodScale,
          ]);

          // Calculate MVP matrix
          let itemMvpMatrix = WebGLUtils.createMatrix();
          WebGLUtils.multiplyMatrices(itemMvpMatrix, projectionMatrix, modelMatrix); // P * M (V is identity)

          // Set uniforms and draw
          gl.uniformMatrix4fv(program.uniformLocations.mvpMatrix, false, itemMvpMatrix);
          gl.uniform4f(program.uniformLocations.color, r, g, b, finalAlpha);
          gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        }
      }
    }

    // --- Draw Players ---
    if (gameState.players) {
      // Draw particles first (additive blending)
      drawParticles(gl, shaderPrograms, buffers, projectionMatrix, zoomLevel, gameState);

      const colorProgram = shaderPrograms.color;
      if (colorProgram && colorProgram.program && buffers.quad) {
        gl.useProgram(colorProgram.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
        gl.vertexAttribPointer(colorProgram.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(colorProgram.attribLocations.position);

        for (let id in gameState.players) {
          let p = gameState.players[id];
          if (!p || p.isGhost || !p.trail) continue; // Skip ghosts and players without trails

          // Basic culling for players based on head position
          const distSq = (p.x - cameraX) ** 2 + (p.y - cameraY) ** 2;
          const aoiRadius = 2000; // Use default value directly
          const cullThresholdSq = (aoiRadius * 1.1) ** 2; // Cull slightly outside AoI
          if (id !== localMyId && distSq > cullThresholdSq) {
            continue; // Skip rendering players too far away
          }

          // --- Calculate God Mode Glow (if active) ---
          let godModeGlowAlpha = 0.0;
          if (p.godmode) {
            const godModeDuration = 5000; // Use client-side constant (matches server default)
            const elapsed = currentTime - (p.godmodeStartTime || currentTime);
            const remainingRatio = Math.max(0, 1 - elapsed / godModeDuration);
            if (remainingRatio > 0) {
              const pulseFactor = (1 + Math.sin((currentTime / 1000) * GODMODE_PULSE_SPEED)) / 2; // 0 to 1 sine wave
              const baseAlpha =
                GODMODE_MIN_ALPHA + (GODMODE_MAX_ALPHA - GODMODE_MIN_ALPHA) * pulseFactor;
              godModeGlowAlpha = baseAlpha * remainingRatio; // Fade out glow as god mode expires
            }
          }

          // --- Calculate Segment/Head Sizes ---
          const baseRadius = 3;
          const sizeFactor = Math.log10(Math.max(10, p.maxTrailLength || 10));
          const maxAdditionalRadius = 8;
          let additionalRadius = Math.min(maxAdditionalRadius, Math.floor(sizeFactor * 2.5));
          let segmentRadius = baseRadius + additionalRadius;
          let headRadius = segmentRadius * 1.3;

          // --- Skin Data ---
          const skin = p.skinData || {
            bodyType: 'single',
            bodyColor: p.bodyColor || 'white',
            patternColors: [],
            trailEffect: 'none',
          };
          const patternColors =
            skin.patternColors && skin.patternColors.length > 0
              ? skin.patternColors
              : [skin.bodyColor];

          // --- Draw Trail Segments ---
          let particleSpawnCounter = 0;
          const segmentSkipFactor = p.boost ? 3 : 1; // Draw fewer segments when boosting
          const trailLengthToDraw = Math.min(p.trail.length, Math.ceil(p.maxTrailLength));
          const startIndex = Math.max(0, p.trail.length - trailLengthToDraw); // Ensure startIndex is not negative

          for (let i = p.trail.length - 1; i >= startIndex; i -= segmentSkipFactor) {
            const segment = p.trail[i];
            if (!segment) continue;

            // Determine segment color
            let segmentColorHex = skin.bodyColor;
            if (skin.bodyType === 'pattern' && patternColors.length > 0) {
              const drawnIndex = p.trail.length - 1 - i;
              const patternIndex =
                Math.floor(drawnIndex / segmentSkipFactor) % patternColors.length;
              segmentColorHex = patternColors[patternIndex];
            }
            const [r, g, b] = WebGLUtils.hexToRgbNormalized(segmentColorHex);
            const segmentAlpha = p.isFrozen ? 0.4 : 1.0; // Base alpha

            // --- Draw God Mode Glow (Before Segment) ---
            if (godModeGlowAlpha > 0.01) {
              WebGLUtils.identityMatrix(modelMatrix);
              WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [segment.x, segment.y]);
              WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [
                segmentRadius + GODMODE_GLOW_OFFSET,
                segmentRadius + GODMODE_GLOW_OFFSET,
              ]);
              let glowMvpMatrix = WebGLUtils.createMatrix();
              WebGLUtils.multiplyMatrices(glowMvpMatrix, projectionMatrix, modelMatrix);
              gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, glowMvpMatrix);
              gl.uniform4f(
                colorProgram.uniformLocations.color,
                GODMODE_GLOW_COLOR[0],
                GODMODE_GLOW_COLOR[1],
                GODMODE_GLOW_COLOR[2],
                godModeGlowAlpha
              );
              gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
            }

            // --- Draw Actual Segment ---
            WebGLUtils.identityMatrix(modelMatrix);
            WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [segment.x, segment.y]);
            WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [segmentRadius, segmentRadius]);
            let segmentMvpMatrix = WebGLUtils.createMatrix();
            WebGLUtils.multiplyMatrices(segmentMvpMatrix, projectionMatrix, modelMatrix);
            gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, segmentMvpMatrix);
            gl.uniform4f(colorProgram.uniformLocations.color, r, g, b, segmentAlpha);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            // --- Spawn Particles ---
            particleSpawnCounter++;
            // Spawn less frequently if not boosting
            const particleSpawnThreshold = p.boost ? 2 : 4;
            if (
              i >= startIndex &&
              particleSpawnCounter >= particleSpawnThreshold &&
              !p.isFrozen &&
              typeof maybeSpawnParticle === 'function'
            ) {
              maybeSpawnParticle(p, segment.x, segment.y, currentTime);
              particleSpawnCounter = 0;
            }
          }

          // --- Draw Head ---
          const [hr, hg, hb] = WebGLUtils.hexToRgbNormalized(p.headColor || 'white');
          const headAlpha = p.isFrozen ? 0.4 : 1.0;

          // --- Draw God Mode Glow (Before Head) ---
          if (godModeGlowAlpha > 0.01) {
            WebGLUtils.identityMatrix(modelMatrix);
            WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [p.x, p.y]);
            WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [
              headRadius + GODMODE_GLOW_OFFSET,
              headRadius + GODMODE_GLOW_OFFSET,
            ]);
            let headGlowMvp = WebGLUtils.createMatrix();
            WebGLUtils.multiplyMatrices(headGlowMvp, projectionMatrix, modelMatrix);
            gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, headGlowMvp);
            gl.uniform4f(
              colorProgram.uniformLocations.color,
              GODMODE_GLOW_COLOR[0],
              GODMODE_GLOW_COLOR[1],
              GODMODE_GLOW_COLOR[2],
              godModeGlowAlpha
            );
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          }

          // --- Draw Actual Head ---
          WebGLUtils.identityMatrix(modelMatrix);
          WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [p.x, p.y]);
          WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [headRadius, headRadius]);
          let headMvpMatrix = WebGLUtils.createMatrix();
          WebGLUtils.multiplyMatrices(headMvpMatrix, projectionMatrix, modelMatrix);
          gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, headMvpMatrix);
          gl.uniform4f(colorProgram.uniformLocations.color, hr, hg, hb, headAlpha);
          gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

          // --- Draw Eyes (If not frozen) ---
          if (!p.isFrozen) {
            const baseEyeScale = Math.max(1.0, headRadius * 0.4); // Scale eyes with head size
            const outerEyeRadius = baseEyeScale;
            const innerEyeRadius = baseEyeScale * 0.5; // Pupil size
            const eyeForwardOffset = headRadius * 0.35; // How far forward
            const eyeSidewaysOffset = headRadius * 0.4; // How far apart

            // Calculate eye positions based on head angle
            const forwardX = Math.cos(p.angle);
            const forwardY = Math.sin(p.angle);
            const sidewaysX = -forwardY; // Perpendicular vector
            const sidewaysY = forwardX;

            const leftEyeCenterX =
              p.x + forwardX * eyeForwardOffset + sidewaysX * eyeSidewaysOffset;
            const leftEyeCenterY =
              p.y + forwardY * eyeForwardOffset + sidewaysY * eyeSidewaysOffset;
            const rightEyeCenterX =
              p.x + forwardX * eyeForwardOffset - sidewaysX * eyeSidewaysOffset;
            const rightEyeCenterY =
              p.y + forwardY * eyeForwardOffset - sidewaysY * eyeSidewaysOffset;

            const whiteR = 1.0,
              whiteG = 1.0,
              whiteB = 1.0;
            const blackR = 0.0,
              blackG = 0.0,
              blackB = 0.0;
            const eyeAlpha = headAlpha; // Match head opacity

            // Draw Left Eye (Outer White, Inner Black)
            WebGLUtils.identityMatrix(modelMatrix);
            WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [leftEyeCenterX, leftEyeCenterY]);
            WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [outerEyeRadius, outerEyeRadius]);
            let leftOuterMvp = WebGLUtils.createMatrix();
            WebGLUtils.multiplyMatrices(leftOuterMvp, projectionMatrix, modelMatrix);
            gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, leftOuterMvp);
            gl.uniform4f(colorProgram.uniformLocations.color, whiteR, whiteG, whiteB, eyeAlpha);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            WebGLUtils.identityMatrix(modelMatrix);
            WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [leftEyeCenterX, leftEyeCenterY]);
            WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [innerEyeRadius, innerEyeRadius]);
            let leftInnerMvp = WebGLUtils.createMatrix();
            WebGLUtils.multiplyMatrices(leftInnerMvp, projectionMatrix, modelMatrix);
            gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, leftInnerMvp);
            gl.uniform4f(colorProgram.uniformLocations.color, blackR, blackG, blackB, eyeAlpha);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            // Draw Right Eye (Outer White, Inner Black)
            WebGLUtils.identityMatrix(modelMatrix);
            WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [
              rightEyeCenterX,
              rightEyeCenterY,
            ]);
            WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [outerEyeRadius, outerEyeRadius]);
            let rightOuterMvp = WebGLUtils.createMatrix();
            WebGLUtils.multiplyMatrices(rightOuterMvp, projectionMatrix, modelMatrix);
            gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, rightOuterMvp);
            gl.uniform4f(colorProgram.uniformLocations.color, whiteR, whiteG, whiteB, eyeAlpha);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            WebGLUtils.identityMatrix(modelMatrix);
            WebGLUtils.translateMatrix(modelMatrix, modelMatrix, [
              rightEyeCenterX,
              rightEyeCenterY,
            ]);
            WebGLUtils.scaleMatrix(modelMatrix, modelMatrix, [innerEyeRadius, innerEyeRadius]);
            let rightInnerMvp = WebGLUtils.createMatrix();
            WebGLUtils.multiplyMatrices(rightInnerMvp, projectionMatrix, modelMatrix);
            gl.uniformMatrix4fv(colorProgram.uniformLocations.mvpMatrix, false, rightInnerMvp);
            gl.uniform4f(colorProgram.uniformLocations.color, blackR, blackG, blackB, eyeAlpha);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          } // End eye drawing
        } // End player loop
      } // End colorProgram check
    } // End gameState.players check

    // --- Draw Text Overlay ---
    // This draws names and frozen indicators on the separate 2D canvas
    drawTextOverlay(
      textOverlayCtx,
      textOverlayCanvas,
      gameState,
      cameraX,
      cameraY,
      zoomLevel,
      localMyId,
      selectedPlayerId
    );

    // --- Draw Minimap ---
    // This draws the minimap elements (background, border, dots, view rect)
    drawMinimapWebGL(
      gl,
      canvas,
      shaderPrograms,
      buffers,
      gameState,
      localMyId,
      cameraX,
      cameraY,
      zoomLevel,
      worldWidth,
      worldHeight,
      mapShape
    );
  } // End drawGame

  // Expose public methods
  return {
    drawGame: drawGame,
    PARTICLE_LIFESPAN,
    PARTICLE_FADE_DURATION,
    MAX_PARTICLES_PER_PLAYER,
  };
})();

// Make GameRenderer globally available
window.GameRenderer = GameRenderer;
