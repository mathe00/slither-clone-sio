// --- public/webgl-utils.js ---
/**
 * ==============================================================================
 * FILE: webgl-utils.js
 *
 * DESCRIPTION:
 * Provides utility functions for WebGL context initialization, shader compilation
 * and linking, buffer creation, texture loading, basic matrix operations (4x4),
 * color conversion, and simple primitive drawing (quads). Encapsulates the WebGL
 * state (context, programs, buffers, textures). Used extensively by game-renderer.js.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully (WebGL errors).
 * - Keep matrix math and WebGL calls optimized.
 * ==============================================================================
 */

const WebGLUtils = (() => {
  let gl = null; // WebGL context
  let shaderPrograms = {}; // Store compiled shader programs { name: { program, attribLocations, uniformLocations } }
  let buffers = {}; // Store WebGL buffers { name: buffer }
  let textures = {}; // Store WebGL textures { name: texture }

  // Reusable matrices
  let projectionMatrix = createMatrix();
  let viewMatrix = createMatrix();
  let modelMatrix = createMatrix(); // Reused for drawing objects

  // --- Shader Sources ---
  const vertexShaderSource = `
          attribute vec2 a_position;
          uniform mat4 u_mvpMatrix;
          void main() {
              gl_Position = u_mvpMatrix * vec4(a_position, 0.0, 1.0);
              gl_PointSize = 5.0; // Example: fixed size
          }
      `;

  const fragmentShaderSource = `
          precision lowp float;
          uniform lowp vec4 u_color; // Uniform color for solid shapes
          void main() {
              gl_FragColor = u_color;
          }
      `;

  const texVertexShaderSource = `
          attribute vec2 a_position;
          attribute vec2 a_texCoord;
          uniform mat4 u_mvpMatrix;
          uniform vec2 u_texCoordScale;
          uniform vec2 u_texCoordOffset;
          varying highp vec2 v_texCoord;
          void main() {
              gl_Position = u_mvpMatrix * vec4(a_position, 0.0, 1.0);
              v_texCoord = a_texCoord * u_texCoordScale + u_texCoordOffset;
          }
      `;

  const texFragmentShaderSource = `
          precision lowp float;
          varying highp vec2 v_texCoord;
          uniform sampler2D u_sampler;
          uniform lowp float u_opacity;
          void main() {
              lowp vec4 texColor = texture2D(u_sampler, v_texCoord);
              gl_FragColor = vec4(texColor.rgb, texColor.a * u_opacity);
          }
      `;

  const gridVertexShaderSource = `
          attribute vec2 a_position;
          uniform mat4 u_mvpMatrix;
          uniform vec2 u_quadScale;
          uniform vec2 u_quadOffset;
          varying vec2 v_worldCoord;
          void main() {
              gl_Position = u_mvpMatrix * vec4(a_position, 0.0, 1.0);
              v_worldCoord = u_quadOffset + (a_position + 0.5) * u_quadScale;
          }
      `;

  const gridFragmentShaderSource = `
          precision mediump float;
          varying vec2 v_worldCoord;
          uniform vec4 u_bgColor;
          uniform vec4 u_lineColor;
          uniform float u_gridSize;
          uniform float u_lineThickness;
          void main() {
              vec2 coordInGrid = mod(v_worldCoord, u_gridSize);
              float lineFactorX = smoothstep(0.0, u_lineThickness, coordInGrid.x) - smoothstep(u_gridSize - u_lineThickness, u_gridSize, coordInGrid.x);
              float lineFactorY = smoothstep(0.0, u_lineThickness, coordInGrid.y) - smoothstep(u_gridSize - u_lineThickness, u_gridSize, coordInGrid.y);
              float gridFactor = min(lineFactorX, lineFactorY);
              gl_FragColor = mix(u_lineColor, u_bgColor, gridFactor);
          }
      `;

  // --- WebGL Initialization and Utilities ---
  function initWebGL(canvasElement) {
    gl =
      canvasElement.getContext('webgl2') ||
      canvasElement.getContext('webgl') ||
      canvasElement.getContext('experimental-webgl');
    if (!gl) {
      console.error('WebGL not supported or unable to initialize. The game cannot start.');
      alert('WebGL is not supported by your browser. The game cannot start.');
      return false;
    }
    console.log('WebGL Context Initialized:', gl.getParameter(gl.VERSION));
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.04, 0.02, 0.06, 1.0); // Dark purple clear color #0a050f
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // Standard alpha blending

    // --- Compile Shaders and Get Locations ---
    // 1. Color Shader
    const colorProgram = initShaderProgramInternal(vertexShaderSource, fragmentShaderSource);
    if (!colorProgram) {
      console.error('Failed to initialize COLOR shader program.');
      return false;
    }
    shaderPrograms.color = {
      program: colorProgram,
      attribLocations: {
        position: gl.getAttribLocation(colorProgram, 'a_position'),
      },
      uniformLocations: {
        mvpMatrix: gl.getUniformLocation(colorProgram, 'u_mvpMatrix'),
        color: gl.getUniformLocation(colorProgram, 'u_color'),
      },
    };

    // 2. Texture Shader
    const texProgram = initShaderProgramInternal(texVertexShaderSource, texFragmentShaderSource);
    if (!texProgram) {
      console.error('Failed to initialize TEXTURE shader program.');
      return false;
    }
    shaderPrograms.texture = {
      program: texProgram,
      attribLocations: {
        position: gl.getAttribLocation(texProgram, 'a_position'),
        texCoord: gl.getAttribLocation(texProgram, 'a_texCoord'),
      },
      uniformLocations: {
        mvpMatrix: gl.getUniformLocation(texProgram, 'u_mvpMatrix'),
        sampler: gl.getUniformLocation(texProgram, 'u_sampler'),
        opacity: gl.getUniformLocation(texProgram, 'u_opacity'),
        // Add scale/offset uniforms if needed later
        texCoordScale: gl.getUniformLocation(texProgram, 'u_texCoordScale'),
        texCoordOffset: gl.getUniformLocation(texProgram, 'u_texCoordOffset'),
      },
    };

    // 3. Grid Shader
    const gridProgram = initShaderProgramInternal(gridVertexShaderSource, gridFragmentShaderSource);
    if (!gridProgram) {
      console.error('Failed to initialize GRID shader program.');
      return false;
    }
    shaderPrograms.grid = {
      program: gridProgram,
      attribLocations: {
        position: gl.getAttribLocation(gridProgram, 'a_position'),
      },
      uniformLocations: {
        mvpMatrix: gl.getUniformLocation(gridProgram, 'u_mvpMatrix'),
        quadScale: gl.getUniformLocation(gridProgram, 'u_quadScale'),
        quadOffset: gl.getUniformLocation(gridProgram, 'u_quadOffset'),
        bgColor: gl.getUniformLocation(gridProgram, 'u_bgColor'),
        lineColor: gl.getUniformLocation(gridProgram, 'u_lineColor'),
        gridSize: gl.getUniformLocation(gridProgram, 'u_gridSize'),
        lineThickness: gl.getUniformLocation(gridProgram, 'u_lineThickness'),
      },
    };

    // --- Create Common Buffers ---
    const quadVertices = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
    buffers.quad = createBuffer(quadVertices);
    const texCoords = new Float32Array([0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]);
    buffers.texCoord = createBuffer(texCoords);

    return true;
  }

  function loadShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(
        `Shader compilation error (${type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'}):`,
        gl.getShaderInfoLog(shader)
      );
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  // Internal helper, not exported directly
  function initShaderProgramInternal(vsSource, fsSource) {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return null;

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Shader program link error:', gl.getProgramInfoLog(shaderProgram));
      gl.deleteProgram(shaderProgram);
      // Detach and delete shaders explicitly on failure
      gl.detachShader(shaderProgram, vertexShader);
      gl.detachShader(shaderProgram, fragmentShader);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    // Detach and delete shaders after successful linking (they are no longer needed)
    gl.detachShader(shaderProgram, vertexShader);
    gl.detachShader(shaderProgram, fragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return shaderProgram;
  }

  function createBuffer(data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, usage);
    gl.bindBuffer(target, null); // Unbind
    return buffer;
  }

  // function loadTexture(url, callback) { // Commented out as it's not used
  //   const texture = gl.createTexture();
  //   gl.bindTexture(gl.TEXTURE_2D, texture);
  //
  //   // Placeholder pixel while loading
  //   const level = 0;
  //   const internalFormat = gl.RGBA;
  //   const width = 1;
  //   const height = 1;
  //   const border = 0;
  //   const srcFormat = gl.RGBA;
  //   const srcType = gl.UNSIGNED_BYTE;
  //   const pixel = new Uint8Array([0, 0, 255, 255]); // Blue placeholder
  //   gl.texImage2D(
  //     gl.TEXTURE_2D,
  //     level,
  //     internalFormat,
  //     width,
  //     height,
  //     border,
  //     srcFormat,
  //     srcType,
  //     pixel
  //   );
  //
  //   const image = new Image();
  //   image.onload = () => {
  //     gl.bindTexture(gl.TEXTURE_2D, texture);
  //     gl.texImage2D(
  //       gl.TEXTURE_2D,
  //       level,
  //       internalFormat,
  //       srcFormat,
  //       srcType,
  //       image
  //     );
  //
  //     if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
  //       gl.generateMipmap(gl.TEXTURE_2D);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  //     } else {
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  //     }
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  //     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  //
  //     console.log("Texture loaded successfully:", url);
  //     if (callback) callback(null, texture);
  //   };
  //   image.onerror = (err) => {
  //     console.error("Failed to load texture:", url, err);
  //     if (callback)
  //       callback(new Error(`Failed to load texture: ${url}`), null);
  //   };
  //   image.src = url;
  //
  //   return texture;
  // }

  // function isPowerOf2(value) { // Commented out as it's not used
  //   return (value & (value - 1)) === 0;
  // }

  // --- Matrix Math Utilities (Basic) ---
  function createMatrix() {
    return new Float32Array(16); // 4x4 matrix
  }

  function identityMatrix(out) {
    out.fill(0);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  }

  function multiplyMatrices(out, a, b) {
    let a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    let a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    let a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    let a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];
    let b00 = b[0],
      b01 = b[1],
      b02 = b[2],
      b03 = b[3];
    let b10 = b[4],
      b11 = b[5],
      b12 = b[6],
      b13 = b[7];
    let b20 = b[8],
      b21 = b[9],
      b22 = b[10],
      b23 = b[11];
    let b30 = b[12],
      b31 = b[13],
      b32 = b[14],
      b33 = b[15];
    out[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
    out[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
    out[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
    out[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
    out[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
    out[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
    out[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
    out[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
    out[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
    out[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
    out[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
    out[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
    out[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
    out[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
    out[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
    out[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
    return out;
  }

  function orthoMatrix(out, left, right, bottom, top, near, far) {
    let lr = 1 / (left - right);
    let bt = 1 / (bottom - top);
    let nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  }

  function translateMatrix(out, a, v) {
    let x = v[0],
      y = v[1],
      z = v[2] || 0;
    let a00, a01, a02, a03;
    let a10, a11, a12, a13;
    let a20, a21, a22, a23;
    let a30, a31, a32, a33;

    if (a === out) {
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
      a00 = a[0];
      a01 = a[1];
      a02 = a[2];
      a03 = a[3];
      a10 = a[4];
      a11 = a[5];
      a12 = a[6];
      a13 = a[7];
      a20 = a[8];
      a21 = a[9];
      a22 = a[10];
      a23 = a[11];
      a30 = a[12];
      a31 = a[13];
      a32 = a[14];
      a33 = a[15];
      out[0] = a00;
      out[1] = a01;
      out[2] = a02;
      out[3] = a03;
      out[4] = a10;
      out[5] = a11;
      out[6] = a12;
      out[7] = a13;
      out[8] = a20;
      out[9] = a21;
      out[10] = a22;
      out[11] = a23;
      out[12] = a00 * x + a10 * y + a20 * z + a30;
      out[13] = a01 * x + a11 * y + a21 * z + a31;
      out[14] = a02 * x + a12 * y + a22 * z + a32;
      out[15] = a03 * x + a13 * y + a23 * z + a33;
    }
    return out;
  }

  function scaleMatrix(out, a, v) {
    let x = v[0],
      y = v[1],
      z = v[2] || 1;
    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
  }

  function rotateMatrixZ(out, a, rad) {
    let s = Math.sin(rad);
    let c = Math.cos(rad);
    let a00 = a[0];
    let a01 = a[1];
    let a02 = a[2];
    let a03 = a[3];
    let a10 = a[4];
    let a11 = a[5];
    let a12 = a[6];
    let a13 = a[7];
    if (a !== out) {
      out[8] = a[8];
      out[9] = a[9];
      out[10] = a[10];
      out[11] = a[11];
      out[12] = a[12];
      out[13] = a[13];
      out[14] = a[14];
      out[15] = a[15];
    }
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
  }

  // --- Color Parsing ---
  function hexToRgbNormalized(hex) {
    let r = 0,
      g = 0,
      b = 0;
    if (hex.length == 4) {
      r = '0x' + hex[1] + hex[1];
      g = '0x' + hex[2] + hex[2];
      b = '0x' + hex[3] + hex[3];
    } else if (hex.length == 7) {
      r = '0x' + hex[1] + hex[2];
      g = '0x' + hex[3] + hex[4];
      b = '0x' + hex[5] + hex[6];
    }
    return [r / 255, g / 255, b / 255];
  }

  // --- WebGL Drawing Helper: Draw Quad ---
  function drawQuad(x, y, width, height, colorArray) {
    if (!gl || !shaderPrograms.color || !buffers.quad) return;

    const programInfo = shaderPrograms.color;
    gl.useProgram(programInfo.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);

    identityMatrix(modelMatrix);
    translateMatrix(modelMatrix, modelMatrix, [x, y]);
    scaleMatrix(modelMatrix, modelMatrix, [width, height]);

    let mvpMatrix = createMatrix();
    // Combine model, view (identity), and projection
    multiplyMatrices(mvpMatrix, viewMatrix, modelMatrix); // M * V
    multiplyMatrices(mvpMatrix, projectionMatrix, mvpMatrix); // P * (M*V)

    gl.uniformMatrix4fv(programInfo.uniformLocations.mvpMatrix, false, mvpMatrix);
    gl.uniform4f(
      programInfo.uniformLocations.color,
      colorArray[0],
      colorArray[1],
      colorArray[2],
      colorArray[3]
    );

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  // --- Cleanup ---
  function cleanup() {
    if (gl) {
      console.log('Cleaning up WebGL resources...');
      // Delete buffers
      for (const key in buffers) {
        if (buffers[key]) {
          gl.deleteBuffer(buffers[key]);
          // console.log(`Deleted buffer: ${key}`); // Optional debug log
        }
      }
      // Delete textures
      for (const key in textures) {
        if (textures[key]) {
          gl.deleteTexture(textures[key]);
          // console.log(`Deleted texture: ${key}`); // Optional debug log
        }
      }
      // Delete shader programs
      for (const key in shaderPrograms) {
        if (shaderPrograms[key] && shaderPrograms[key].program) {
          gl.deleteProgram(shaderPrograms[key].program);
          // console.log(`Deleted program: ${key}`); // Optional debug log
        }
      }

      // Clear internal state BUT keep gl context reference
      buffers = {};
      textures = {};
      shaderPrograms = {};
      // gl = null; // DO NOT set gl to null here, it is still valid

      console.log('WebGL resource cleanup complete (context kept alive).');
    } else {
      console.log('Cleanup called but WebGL context was already null.');
      // Ensure state is clear even if gl was null
      buffers = {};
      textures = {};
      shaderPrograms = {};
    }
  }

  // --- Public Interface ---
  return {
    initialize: initWebGL,
    cleanup: cleanup,
    getContext: () => gl,
    getShaders: () => shaderPrograms,
    getBuffers: () => buffers,
    getTextures: () => textures,
    getProjectionMatrix: () => projectionMatrix,
    getViewMatrix: () => viewMatrix,
    getModelMatrix: () => modelMatrix,
    // Matrix functions
    createMatrix,
    identityMatrix,
    multiplyMatrices,
    orthoMatrix,
    translateMatrix,
    scaleMatrix,
    rotateMatrixZ,
    // Color function
    hexToRgbNormalized,
    // Drawing function
    drawQuad,
    // Buffer creation
    createBuffer,
  };
})();

// Make WebGLUtils globally available
window.WebGLUtils = WebGLUtils;
