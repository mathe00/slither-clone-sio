// --- public/webgpu-utils.js ---
/**
 * ==============================================================================
 * FILE: webgpu-utils.js
 *
 * DESCRIPTION:
 * Provides WebGPU context initialization, shader compilation, pipeline creation,
 * buffer management, and rendering utilities. This is a modern replacement for
 * WebGL, offering significantly better performance and capabilities.
 *
 * FEATURES:
 * - WebGPU detection with WebGL fallback
 * - WGSL shader compilation
 * - GPU buffer management
 * - Render pipeline creation
 * - Matrix operations
 * - High-performance rendering
 *
 * ==============================================================================
 */

const WebGPUUtils = (() => {
  let device = null;
  let context = null;
  let pipelineCache = {};
  let bufferCache = {};
  let uniformBindGroups = {};
  let isWebGPU = false;
  let webglFallback = null;

  // Reusable matrices
  let projectionMatrix = createMatrix();
  let viewMatrix = createMatrix();
  let modelMatrix = createMatrix();

  // --- WGSL Shader Sources ---
  const vertexShaderWGSL = `
    struct VertexInput {
      @location(0) position: vec2<f32>,
    };

    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
    };

    struct Uniforms {
      mvpMatrix: mat4x4<f32>,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    @vertex
    fn main(input: VertexInput) -> VertexOutput {
      var output: VertexOutput;
      output.position = uniforms.mvpMatrix * vec4<f32>(input.position, 0.0, 1.0);
      return output;
    }
  `;

  const fragmentShaderWGSL = `
    struct Uniforms {
      color: vec4<f32>,
    };

    @group(0) @binding(1) var<uniform> uniforms: Uniforms;

    @fragment
    fn main() -> @location(0) vec4<f32> {
      return uniforms.color;
    }
  `;

  const textureVertexShaderWGSL = `
    struct VertexInput {
      @location(0) position: vec2<f32>,
      @location(1) texCoord: vec2<f32>,
    };

    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) texCoord: vec2<f32>,
    };

    struct Uniforms {
      mvpMatrix: mat4x4<f32>,
      texCoordScale: vec2<f32>,
      texCoordOffset: vec2<f32>,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    @vertex
    fn main(input: VertexInput) -> VertexOutput {
      var output: VertexOutput;
      output.position = uniforms.mvpMatrix * vec4<f32>(input.position, 0.0, 1.0);
      output.texCoord = input.texCoord * uniforms.texCoordScale + uniforms.texCoordOffset;
      return output;
    }
  `;

  const textureFragmentShaderWGSL = `
    struct Uniforms {
      opacity: f32,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var textureSampler: sampler;
    @group(0) @binding(2) var texture: texture_2d<f32>;

    @fragment
    fn main(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
      let texColor = textureSample(texture, textureSampler, texCoord);
      return vec4<f32>(texColor.rgb, texColor.a * uniforms.opacity);
    }
  `;

  const gridVertexShaderWGSL = `
    struct VertexInput {
      @location(0) position: vec2<f32>,
    };

    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) worldCoord: vec2<f32>,
    };

    struct Uniforms {
      mvpMatrix: mat4x4<f32>,
      quadScale: vec2<f32>,
      quadOffset: vec2<f32>,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    @vertex
    fn main(input: VertexInput) -> VertexOutput {
      var output: VertexOutput;
      output.position = uniforms.mvpMatrix * vec4<f32>(input.position, 0.0, 1.0);
      output.worldCoord = uniforms.quadOffset + (input.position + 0.5) * uniforms.quadScale;
      return output;
    }
  `;

  const gridFragmentShaderWGSL = `
    struct Uniforms {
      bgColor: vec4<f32>,
      lineColor: vec4<f32>,
      gridSize: f32,
      lineThickness: f32,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    @fragment
    fn main(@location(0) worldCoord: vec2<f32>) -> @location(0) vec4<f32> {
      let coordInGrid = mod(worldCoord, uniforms.gridSize);
      let lineFactorX = smoothstep(0.0, uniforms.lineThickness, coordInGrid.x) - smoothstep(uniforms.gridSize - uniforms.lineThickness, uniforms.gridSize, coordInGrid.x);
      let lineFactorY = smoothstep(0.0, uniforms.lineThickness, coordInGrid.y) - smoothstep(uniforms.gridSize - uniforms.lineThickness, uniforms.gridSize, coordInGrid.y);
      let gridFactor = min(lineFactorX, lineFactorY);
      return mix(uniforms.lineColor, uniforms.bgColor, gridFactor);
    }
  `;

  // --- WebGPU Initialization ---
  async function initWebGPU(canvasElement) {
    // Check if WebGPU is available
    if (!navigator.gpu) {
      console.log('WebGPU not supported, falling back to WebGL');
      return await initWebGLFallback(canvasElement);
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.log('WebGPU adapter not available, falling back to WebGL');
        return await initWebGLFallback(canvasElement);
      }

      device = await adapter.requestDevice();
      context = canvasElement.getContext('webgpu');
      
      if (!context) {
        console.log('WebGPU context not available, falling back to WebGL');
        return await initWebGLFallback(canvasElement);
      }

      const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: 'premultiplied',
      });

      isWebGPU = true;
      console.log('WebGPU Context Initialized Successfully');

      // Initialize pipelines
      await initPipelines();
      
      // Create common buffers
      createCommonBuffers();

      return true;
    } catch (error) {
      console.error('WebGPU initialization failed:', error);
      console.log('Falling back to WebGL');
      return await initWebGLFallback(canvasElement);
    }
  }

  // --- WebGL Fallback ---
  async function initWebGLFallback(canvasElement) {
    // Load the existing WebGL utils
    if (typeof WebGLUtils !== 'undefined') {
      const success = WebGLUtils.initialize(canvasElement);
      if (success) {
        webglFallback = WebGLUtils;
        isWebGPU = false;
        console.log('WebGL fallback initialized');
        return true;
      }
    }
    
    console.error('WebGL fallback also failed');
    return false;
  }

  // --- Pipeline Initialization ---
  async function initPipelines() {
    // Color pipeline
    pipelineCache.color = await createRenderPipeline(vertexShaderWGSL, fragmentShaderWGSL, {
      position: { format: 'float32x2' }
    });

    // Texture pipeline
    pipelineCache.texture = await createRenderPipeline(textureVertexShaderWGSL, textureFragmentShaderWGSL, {
      position: { format: 'float32x2' },
      texCoord: { format: 'float32x2' }
    });

    // Grid pipeline
    pipelineCache.grid = await createRenderPipeline(gridVertexShaderWGSL, gridFragmentShaderWGSL, {
      position: { format: 'float32x2' }
    });
  }

  // --- Render Pipeline Creation ---
  async function createRenderPipeline(vertexShader, fragmentShader, vertexBufferLayouts) {
    const vertexShaderModule = device.createShaderModule({ code: vertexShader });
    const fragmentShaderModule = device.createShaderModule({ code: fragmentShader });

    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: vertexShaderModule,
        entryPoint: 'main',
        buffers: Object.entries(vertexBufferLayouts).map(([location, layout]) => ({
          arrayStride: layout.format === 'float32x2' ? 8 : 16,
          attributes: [{
            shaderLocation: parseInt(location),
            offset: 0,
            format: layout.format
          }]
        }))
      },
      fragment: {
        module: fragmentShaderModule,
        entryPoint: 'main',
        targets: [{
          format: navigator.gpu.getPreferredCanvasFormat(),
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha'
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha'
            }
          }
        }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });
  }

  // --- Buffer Creation ---
  function createBuffer(data, usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usage,
      mappedAtCreation: true
    });
    
    const bufferData = new data.constructor(buffer.getMappedRange());
    bufferData.set(data);
    buffer.unmap();
    
    return buffer;
  }

  function createCommonBuffers() {
    const quadVertices = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
    bufferCache.quad = createBuffer(quadVertices);
    
    const texCoords = new Float32Array([0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]);
    bufferCache.texCoord = createBuffer(texCoords);
  }

  // --- Matrix Math Utilities (Same as WebGL) ---
  function createMatrix() {
    return new Float32Array(16);
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
    let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    let a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    let a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    let a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
    let b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
    let b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
    let b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];
    
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
    let x = v[0], y = v[1], z = v[2] || 0;
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
      a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
      a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
      a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];
      a30 = a[12]; a31 = a[13]; a32 = a[14]; a33 = a[15];
      out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
      out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
      out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;
      out[12] = a00 * x + a10 * y + a20 * z + a30;
      out[13] = a01 * x + a11 * y + a21 * z + a31;
      out[14] = a02 * x + a12 * y + a22 * z + a32;
      out[15] = a03 * x + a13 * y + a23 * z + a33;
    }
    return out;
  }

  function scaleMatrix(out, a, v) {
    let x = v[0], y = v[1], z = v[2] || 1;
    out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
    out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
    out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    return out;
  }

  function rotateMatrixZ(out, a, rad) {
    let s = Math.sin(rad);
    let c = Math.cos(rad);
    let a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    let a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    if (a !== out) {
      out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
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
    let r = 0, g = 0, b = 0;
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

  // --- WebGPU Drawing Helper: Draw Quad ---
  function drawQuad(x, y, width, height, colorArray) {
    if (!isWebGPU) {
      if (webglFallback) {
        webglFallback.drawQuad(x, y, width, height, colorArray);
      }
      return;
    }

    const pipeline = pipelineCache.color;
    if (!pipeline) return;

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.04, g: 0.02, b: 0.06, a: 1.0 },
        loadOp: 'load',
        storeOp: 'store'
      }]
    });

    passEncoder.setPipeline(pipeline);

    // Set vertex buffer
    passEncoder.setVertexBuffer(0, bufferCache.quad);

    // Create uniform buffers
    const mvpMatrix = createMatrix();
    identityMatrix(modelMatrix);
    translateMatrix(modelMatrix, modelMatrix, [x, y]);
    scaleMatrix(modelMatrix, modelMatrix, [width, height]);
    multiplyMatrices(mvpMatrix, viewMatrix, modelMatrix);
    multiplyMatrices(mvpMatrix, projectionMatrix, mvpMatrix);

    const mvpBuffer = createBuffer(mvpMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    const colorBuffer = createBuffer(new Float32Array(colorArray), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    // Create bind group
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: mvpBuffer } },
        { binding: 1, resource: { buffer: colorBuffer } }
      ]
    });

    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    // Cleanup temporary buffers
    mvpBuffer.destroy();
    colorBuffer.destroy();
  }

  // --- Cleanup ---
  function cleanup() {
    if (isWebGPU) {
      console.log('Cleaning up WebGPU resources...');
      
      // Destroy buffers
      for (const key in bufferCache) {
        if (bufferCache[key]) {
          bufferCache[key].destroy();
        }
      }
      
      // Clear cache
      bufferCache = {};
      pipelineCache = {};
      uniformBindGroups = {};
      
      console.log('WebGPU resource cleanup complete.');
    } else if (webglFallback) {
      webglFallback.cleanup();
    }
  }

  // --- Public Interface ---
  return {
    initialize: initWebGPU,
    cleanup: cleanup,
    isWebGPU: () => isWebGPU,
    getDevice: () => device,
    getContext: () => context,
    getDevice: () => device,
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
    // Pipeline cache
    getPipelineCache: () => pipelineCache,
    getBufferCache: () => bufferCache,
  };
})();

// Make WebGPUUtils globally available
window.WebGPUUtils = WebGPUUtils;