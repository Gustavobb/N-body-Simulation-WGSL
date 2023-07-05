// Pixels
@group(0) @binding(0)  
  var<storage, read_write> pixels : array<vec4f>;

// Uniforms
@group(1) @binding(0) 
  var<uniform> rez : f32;

@group(1) @binding(1) 
  var<uniform> time : f32;

@group(1) @binding(2) 
  var<uniform> count : u32;

@group(1) @binding(3)
  var<uniform> mousePos : vec2f;

@group(1) @binding(4)
  var<uniform> attractorsCount : i32;

@group(1) @binding(5)
  var<uniform> booleanFactors : vec2u;

@group(1) @binding(6)
  var<uniform> visualFactors : vec2f;

@group(1) @binding(7)
  var<uniform> maxForces : vec2f;

@group(1) @binding(8)
  var<uniform> maxSpeed : f32;

@group(1) @binding(9)
  var<uniform> mouseAsAttractor : u32;

@group(1) @binding(10)
  var<uniform> killRadius : f32;

// Other buffers
@group(2) @binding(0)  
  var<storage, read_write> positions : array<vec2f>;

@group(2) @binding(1)  
  var<storage, read_write> velocities : array<vec2f>;

@group(2) @binding(2)  
  var<storage, read_write> attractors : array<f32>;

fn r(n: f32) -> f32 
{
  let x = sin(n) * 43758.5453;
  return fract(x);
}

fn index(p: vec2f) -> i32 
{
  return i32(p.x) + i32(p.y) * i32(rez);
}

fn hsv2rgba(h: f32, s: f32, v: f32) -> vec4f 
{
  var c = vec3(h, s, v);
  var K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  var p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  let rgb = c.z * mix(K.xxx, clamp(p - K.xxx, vec3(0.0), vec3(1.0)), c.y);
  return vec4(rgb, 1.0);
}

fn hueShift(col: vec3f) -> vec4f 
{
  var v = vec3f(0.57735, 0.57735, 0.57735);
  var P = v * dot(v, col);
  var U = col - P;
  var V = cross(v, U);
  var colB = U * cos(visualFactors.y * 6.2832) + V * sin(visualFactors.y * 6.2832) + P;
  return vec4f(colB, 1.0) * f32(visualFactors.y > 0.0) + vec4f(col, 1.0) * f32(!(visualFactors.y > 0.0));
}

fn calculateForce(c1: vec2f, c2: vec2f) -> vec3f 
{
  var d = distance(c1, c2) / rez;
  var f = maxForces.x / pow(d, 2.0);
  f = clamp(f, 0.0, maxForces.y);
  var diff = normalize(c2 - c1) * f;
  return vec3f(diff, d);
}

@compute @workgroup_size(256)
fn reset(@builtin(global_invocation_id) id : vec3u) 
{
  var seed = f32(id.x)/f32(count);
  positions[id.x] = vec2(r(seed), r(seed + 0.1)) * rez;
  velocities[id.x] = vec2(0.0001);
}

@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) id : vec3u) 
{
  var p : vec2f = positions[id.x];
  var v : vec2f = velocities[id.x];
  
  if (!(booleanFactors.y > 0))
  {
    pixels[index(p)] = vec4f(0.5);
    return;
  }

  var idx = 0;
  var a = vec3f(0.0);
  var force = calculateForce(p, mousePos) * f32(mouseAsAttractor > 0);
  var info = vec3f(force.xy * (1.0 - f32(booleanFactors.x) * 2.0), f32(mouseAsAttractor > 0) * force.z + f32(mouseAsAttractor == 0) * 1.0);
  var h = info.z;

  for (var i = 0; i < attractorsCount; i++) 
  {
    idx = i * 3;
    a = vec3f(attractors[idx + 0], attractors[idx + 1], attractors[idx + 2]);
    force = calculateForce(p, a.xy);
    
    info += vec3f(force.xy * a.z, 0.0);
    h = min(info.z, force.z);
    info.z = h;
  }

  v += info.xy;
  var agentMaxSpeed = maxSpeed * min((f32(id.x)) + 0.5 , 1.0);
  v = normalize(v) * min(length(v), agentMaxSpeed) * f32(h > killRadius);

  p += v;
  p = (p + rez) % rez;

  positions[id.x] = p;
  velocities[id.x] = v;
  pixels[index(p)] = hueShift(hsv2rgba(h, 1.0, 1.0).xyz) * f32(h > killRadius);
}

@compute @workgroup_size(256)
fn attractor(@builtin(global_invocation_id) id : vec3u) 
{
  var idx = id.x * 3;
  var a = vec3f(attractors[idx + 0], attractors[idx + 1], attractors[idx + 2]);

  var color = (vec4f(0.0, 1.0, 0.0, 1.0) * a.z) * f32(!(a.z < 0.0)) + (vec4f(1.0, 0.0, 0.0, 1.0) * -a.z) * f32(a.z < 0.0);
  for (var i = 0.0; i < 2.0; i += 1.0)
  {
    for (var j = 0.0; j < 2.0; j += 1.0)
    {
      pixels[index(a.xy + vec2f(i, j))] = color;
    }
  }
}

@compute @workgroup_size(16, 16)
fn fade(@builtin(global_invocation_id) id : vec3u) 
{
  pixels[index(vec2f(id.xy))] *= visualFactors.x;
  var hasMouse = distance(mousePos, vec2f(id.xy)) < 3.0;
  var color = vec4f(1.0, 0.0, 0.0, 1.0) * f32(booleanFactors.x > 0) + vec4f(0.0, 1.0, 0.0, 1.0) * f32(!(booleanFactors.x > 0));
  pixels[index(vec2f(id.xy))] += color * f32(hasMouse);
}