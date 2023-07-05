import { createShader, render } from "./lib.js";

/////////////////////////////////////////////////////////
// GPU and CPU Settings

// Sizes in bytes
const sizes = {
  f32: 4,
  u32: 4,
  i32: 4,
  vec2: 8,
  vec3: 12,
  vec4: 16,
  bool: 1,
};

const maxCount = 500000;
const uniforms = {
  isRunning: true,
  rez: 768,
  time: 0,
  count: maxCount,
  fadeFactor: 0.9,
  hueShiftFactor: 0.0,
  isRepelling: false,
  mouseAsAttractor: false,
  gForce: 0.01,
  maxForce: 0.1,
  maxSpeed: 5.0,
  killRadius: 0.0,
};

// CPU-only settings
const settings = {
  scale:
    (0.975 * Math.min(window.innerHeight, window.innerWidth)) / uniforms.rez,
  groupSize: 256,
  pixelWorkgroups: Math.ceil(uniforms.rez / 16),
  agentWorkgroups: Math.ceil(uniforms.count / 256),
  attractorWorkgroups: Math.ceil(10 / 256),
  maxAttractors: 30,
};

/////////////////////////////////////////////////////////
// Main
async function main() 
{
  var audio = new Audio('536170__jadis0x__atmospheric-loop.wav');
  audio.loop = true;
  ///////////////////////
  // Initial setup
  const adapter = await navigator.gpu.requestAdapter();
  const gpu = await adapter.requestDevice();

  const canvas2 = document.createElement("canvas");
  canvas2.width = 1024;
  canvas2.height = 768;
  document.body.appendChild(canvas2);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = uniforms.rez * settings.scale;
  document.body.appendChild(canvas);
  const context = canvas.getContext("webgpu");
  const format = "bgra8unorm";
  context.configure({
    device: gpu,
    format: format,
    alphaMode: "opaque",
  });

  canvas.style.position = "absolute";
  canvas.style.top = "0px";
  canvas.style.left = "0px";
  canvas.style.zIndex = "1";

  canvas2.style.position = "absolute";
  canvas2.style.top = "0px";
  canvas2.style.left = "0px";
  canvas2.style.zIndex = "0";

  /////////////////////////
  // Set up memory resources
  const visibility = GPUShaderStage.COMPUTE;

  // Pixel buffer
  const pixelBuffer = gpu.createBuffer({
    size: uniforms.rez ** 2 * sizes.vec4,
    usage: GPUBufferUsage.STORAGE,
  });
  const pixelBufferLayout = gpu.createBindGroupLayout({
    entries: [{ visibility, binding: 0, buffer: { type: "storage" } }],
  });
  const pixelBufferBindGroup = gpu.createBindGroup({
    layout: pixelBufferLayout,
    entries: [{ binding: 0, resource: { buffer: pixelBuffer } }],
  });

  // Uniform buffers
  const rezBuffer = gpu.createBuffer({
    size: sizes.f32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(rezBuffer, 0, new Float32Array([uniforms.rez]));

  const timeBuffer = gpu.createBuffer({
    size: sizes.f32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(timeBuffer, 0, new Float32Array([uniforms.time]));

  const countBuffer = gpu.createBuffer({
    size: sizes.u32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(countBuffer, 0, new Uint32Array([uniforms.count]));

  const mousePosBuffer = gpu.createBuffer({
    size: sizes.vec2,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(mousePosBuffer, 0, new Float32Array([0, 0]));

  const attractorsCountBuffer = gpu.createBuffer({
    size: sizes.i32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(attractorsCountBuffer, 0, new Int32Array([0]));

  const booleanFactorsBuffer = gpu.createBuffer({
    size: sizes.vec2,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(booleanFactorsBuffer, 0, new Uint32Array([0, 0]));

  const visualFactorsBuffer = gpu.createBuffer({
    size: sizes.vec2,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(visualFactorsBuffer, 0, new Float32Array([uniforms.fadeFactor, uniforms.hueShiftFactor]));

  const maxForcesBuffer = gpu.createBuffer({
    size: sizes.vec2,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(maxForcesBuffer, 0, new Float32Array([uniforms.gForce, uniforms.maxForce]));

  const maxSpeedBuffer = gpu.createBuffer({
    size: sizes.f32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(maxSpeedBuffer, 0, new Float32Array([uniforms.maxSpeed]));

  const mouseAsAttractorBuffer = gpu.createBuffer({
    size: sizes.u32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(mouseAsAttractorBuffer, 0, new Uint32Array([0]));

  const killRadiusBuffer = gpu.createBuffer({
    size: sizes.f32,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  gpu.queue.writeBuffer(killRadiusBuffer, 0, new Float32Array([uniforms.killRadius]));

  const uniformsLayout = gpu.createBindGroupLayout({
    entries: [
      { visibility, binding: 0, buffer: { type: "uniform" } },
      { visibility, binding: 1, buffer: { type: "uniform" } },
      { visibility, binding: 2, buffer: { type: "uniform" } },
      { visibility, binding: 3, buffer: { type: "uniform" } },
      { visibility, binding: 4, buffer: { type: "uniform" } },
      { visibility, binding: 5, buffer: { type: "uniform" } },
      { visibility, binding: 6, buffer: { type: "uniform" } },
      { visibility, binding: 7, buffer: { type: "uniform" } },
      { visibility, binding: 8, buffer: { type: "uniform" } },
      { visibility, binding: 9, buffer: { type: "uniform" } },
      { visibility, binding: 10, buffer: { type: "uniform" } },
    ],
  });
  const uniformsBuffersBindGroup = gpu.createBindGroup({
    layout: uniformsLayout,
    entries: [
      { binding: 0, resource: { buffer: rezBuffer } },
      { binding: 1, resource: { buffer: timeBuffer } },
      { binding: 2, resource: { buffer: countBuffer } },
      { binding: 3, resource: { buffer: mousePosBuffer } },
      { binding: 4, resource: { buffer: attractorsCountBuffer } },
      { binding: 5, resource: { buffer: booleanFactorsBuffer } },
      { binding: 6, resource: { buffer: visualFactorsBuffer } },
      { binding: 7, resource: { buffer: maxForcesBuffer } },
      { binding: 8, resource: { buffer: maxSpeedBuffer } },
      { binding: 9, resource: { buffer: mouseAsAttractorBuffer } },
      { binding: 10, resource: { buffer: killRadiusBuffer } },
    ],
  });

  // Other buffers
  const positionsBuffer = gpu.createBuffer({
    size: sizes.vec2 * uniforms.count,
    usage: GPUBufferUsage.STORAGE,
  });

  const velocitiesBuffer = gpu.createBuffer({
    size: sizes.vec2 * uniforms.count,
    usage: GPUBufferUsage.STORAGE,
  });

  const attractorsArray = new Float32Array(settings.maxAttractors * 3 * sizes.f32);
  let attractorsCount = 0;
  const attractorsBuffer = gpu.createBuffer({
    size: attractorsArray.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });

  const agentsLayout = gpu.createBindGroupLayout({
    entries: [
      { visibility, binding: 0, buffer: { type: "storage" } },
      { visibility, binding: 1, buffer: { type: "storage" } },
      { visibility, binding: 2, buffer: { type: "storage" } },
    ],
  });

  const agentsBuffersBindGroup = gpu.createBindGroup({
    layout: agentsLayout,
    entries: [
      { binding: 0, resource: { buffer: positionsBuffer } },
      { binding: 1, resource: { buffer: velocitiesBuffer } },
      { binding: 2, resource: { buffer: attractorsBuffer } },
    ],
  });

  /////
  // Overall memory layout
  const layout = gpu.createPipelineLayout({
    bindGroupLayouts: [pixelBufferLayout, uniformsLayout, agentsLayout],
  });

  /////////////////////////
  // Set up code instructions
  const module = await createShader(gpu, "agents.wgsl");

  const resetPipeline = gpu.createComputePipeline({
    layout,
    compute: { module, entryPoint: "reset" },
  });

  const simulatePipeline = gpu.createComputePipeline({
    layout,
    compute: { module, entryPoint: "simulate" },
  });

  const attractorPipeline = gpu.createComputePipeline({
    layout,
    compute: { module, entryPoint: "attractor" },
  });

  const fadePipeline = gpu.createComputePipeline({
    layout,
    compute: { module, entryPoint: "fade" },
  });

  const mouse = { x: 0, y: 0 };
  const canvasRect = canvas.getBoundingClientRect();
  canvas.addEventListener("mousemove", (e) => {
    mouse.x = (e.clientX - canvasRect.left) / settings.scale;
    mouse.y = (e.clientY - canvasRect.top) / settings.scale;
  });

  canvas.addEventListener("mousedown", (e) => {
    // add attractor
    if (mouse.x < 0 || mouse.x > uniforms.rez || mouse.y < 0 || mouse.y > uniforms.rez) return;
    if (audio.paused && uniforms.isRunning) audio.play();
    if (attractorsCount >= settings.maxAttractors) return;
    attractorsArray[attractorsCount * 3 + 0] = mouse.x;
    attractorsArray[attractorsCount * 3 + 1] = mouse.y;
    attractorsArray[attractorsCount * 3 + 2] = uniforms.isRepelling ? -1 : 1;
    attractorsCount++;
  });

  // document.addEventListener("keydown", (e) => {
  //   if (e.code != "Escape") return;
  //   uniforms.isRunning = !uniforms.isRunning;
  //   writeUniforms();
  // });

  let paused = false;
  const writeUniforms = () =>
  {
    gpu.queue.writeBuffer(rezBuffer, 0, new Float32Array([uniforms.rez]));
    gpu.queue.writeBuffer(countBuffer, 0, new Uint32Array([uniforms.count]));
    settings.agentWorkgroups = Math.ceil(uniforms.count / settings.groupSize);

    gpu.queue.writeBuffer(
      booleanFactorsBuffer,
      0,
      new Uint32Array([uniforms.isRepelling ? 1 : 0, uniforms.isRunning ? 1 : 0])
    );
    
    // if (uniforms.mouseAsAttractor && !(mouse.x < 0 || mouse.x > uniforms.rez || mouse.y < 0 || mouse.y > uniforms.rez))
    // {
    //   if (audio.paused) audio.play();
    //   if (!uniforms.isRunning) audio.pause();
    // }

    if (uniforms.mouseAsAttractor && audio.paused)
      audio.play();
    
    if (!uniforms.isRunning) 
    {
      paused = true;
      audio.pause();
    }
    else if (paused)
    {
      paused = false;
      audio.play();
    }
    gpu.queue.writeBuffer(
      visualFactorsBuffer,
      0,
      new Float32Array([uniforms.fadeFactor, uniforms.hueShiftFactor])
    );

    gpu.queue.writeBuffer(
      maxForcesBuffer,
      0,
      new Float32Array([uniforms.gForce, uniforms.maxForce])
    );

    gpu.queue.writeBuffer(
      maxSpeedBuffer,
      0,
      new Float32Array([uniforms.maxSpeed])
    );

    gpu.queue.writeBuffer(
      mouseAsAttractorBuffer,
      0,
      new Float32Array([uniforms.mouseAsAttractor ? 1 : 0])
    );

    gpu.queue.writeBuffer(
      killRadiusBuffer,
      0,
      new Float32Array([uniforms.killRadius])
    );
  };

  /////////////////////////
  // RUN the reset shader function
  uniforms.count = 50000;
  const reset = () => {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(resetPipeline);
    pass.setBindGroup(0, pixelBufferBindGroup);
    pass.setBindGroup(1, uniformsBuffersBindGroup);
    pass.setBindGroup(2, agentsBuffersBindGroup);
    pass.dispatchWorkgroups(Math.ceil(maxCount / settings.groupSize));
    pass.end();
    gpu.queue.submit([encoder.finish()]);

    audio.pause();
    writeUniforms();
    // reset attractors
    attractorsCount = 0;
    for (let i = 0; i < settings.maxAttractors * sizes.vec3; i++) attractorsArray[i] = 0;
  };
  reset();

  /////////////////////////
  // RUN the sim compute function and render pixels
  const draw = () => {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, pixelBufferBindGroup);
    pass.setBindGroup(1, uniformsBuffersBindGroup);
    pass.setBindGroup(2, agentsBuffersBindGroup);

    gpu.queue.writeBuffer(
      mousePosBuffer,
      0,
      new Float32Array([mouse.x, mouse.y])
    );

    gpu.queue.writeBuffer(
      attractorsCountBuffer,
      0,
      new Int32Array([attractorsCount])
    );

    gpu.queue.writeBuffer(
      attractorsBuffer,
      0,
      attractorsArray
    );

    pass.setPipeline(fadePipeline);
    pass.dispatchWorkgroups(settings.pixelWorkgroups, settings.pixelWorkgroups);
    
    pass.setPipeline(simulatePipeline);
    pass.dispatchWorkgroups(settings.agentWorkgroups);

    pass.setPipeline(attractorPipeline);
    pass.dispatchWorkgroups(settings.attractorWorkgroups);

    pass.end();

    // Render the pixels buffer to the canvas
    render(gpu, uniforms.rez, pixelBuffer, format, context, encoder);

    gpu.queue.submit([encoder.finish()]);
    gpu.queue.writeBuffer(timeBuffer, 0, new Float32Array([uniforms.time++]));

    setTimeout(draw, 10);
  };

  let gui = new lil.GUI();
  gui.title("N Body Simulation Controls");
  gui.add({ reset }, "reset").name("Reset");
  gui.add(uniforms, "isRunning").name("isRunning");
  const parametersFolder = gui.addFolder("Parameters");
  parametersFolder.add(uniforms, "count").min(0).max(500000).step(1);
  parametersFolder.add(uniforms, "gForce").min(0).max(5).step(0.01);
  parametersFolder.add(uniforms, "maxForce").min(0).max(1).step(0.01);
  parametersFolder.add(uniforms, "maxSpeed").min(0).max(10).step(0.01);
  parametersFolder.add(uniforms, "killRadius").min(0).max(0.2).step(0.01);
  const attractorsFolder = gui.addFolder("Attractors");
  attractorsFolder.add(uniforms, "isRepelling").name("isRepelling");
  attractorsFolder.add(uniforms, "mouseAsAttractor").name("mouseAsAttractor");
  const renderFolder = gui.addFolder("Render");
  renderFolder.add(uniforms, "fadeFactor").min(0).max(1).step(0.01);
  renderFolder.add(uniforms, "hueShiftFactor").min(0).max(1).step(0.01);
  gui.onChange(() => writeUniforms());

  draw();
}
main();