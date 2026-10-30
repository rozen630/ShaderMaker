// 可平铺程序纹理库：tuxalin/procedural-tileable-shaders（MIT，授权原文见 TILEABLE-SHADERS-LICENSE.txt）
// https://github.com/tuxalin/procedural-tileable-shaders/tree/3b867954908418427683f705671b236db0454235
// 按依赖顺序拼接，函数实现未改；原库有几处类型错误编译不过，做了最小修补：补三个转发重载（hash2D / multiNoise 的 float 参数、perlinNoise 的两参数版），crystals 里 vec2 赋给 vec3 处补齐分量。改动处都标了「ShaderMaker」。scale 参数为整数时结果在 [0, 1] UV 内无缝平铺。
export const tileableGlsl = /* glsl */ `
// ---- hash.glsl ----
uint ihash1D(uint q)
{
    // hash by Hugo Elias, Integer Hash - I, 2017
    q = q * 747796405u + 2891336453u;
    q = (q << 13u) ^ q;
    return q * (q * q * 15731u + 789221u) + 1376312589u;
}

uvec2 ihash1D(uvec2 q)
{
    // hash by Hugo Elias, Integer Hash - I, 2017
    q = q * 747796405u + 2891336453u;
    q = (q << 13u) ^ q;
    return q * (q * q * 15731u + 789221u) + 1376312589u;
}

uvec4 ihash1D(uvec4 q)
{
    // hash by Hugo Elias, Integer Hash - I, 2017
    q = q * 747796405u + 2891336453u;
    q = (q << 13u) ^ q;
    return q * (q * q * 15731u + 789221u) + 1376312589u;
}

// @return Value of the noise, range: [0, 1]
float hash1D(float x)
{
    // based on: pcg by Mark Jarzynski: http://www.jcgt.org/published/0009/03/02/
    uint state = uint(x * 8192.0) * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return float((word >> 22u) ^ word) * (1.0 / float(0xffffffffu));;
}

// @return Value of the noise, range: [0, 1]
float hash1D(vec2 x)
{
    // hash by Inigo Quilez, Integer Hash - III, 2017
    uvec2 q = uvec2(x * 8192.0);
    q = 1103515245u * ((q >> 1u) ^ q.yx);
    uint n = 1103515245u * (q.x ^ (q.y >> 3u));
    return float(n) * (1.0 / float(0xffffffffu));
}

// @return Value of the noise, range: [0, 1]
float hash1D(vec3 x)
{
    // based on: pcg3 by Mark Jarzynski: http://www.jcgt.org/published/0009/03/02/
    uvec3 v = uvec3(x * 8192.0) * 1664525u + 1013904223u;
    v += v.yzx * v.zxy;
    v ^= v >> 16u;
    return float(v.x + v.y * v.z) * (1.0 / float(0xffffffffu));
}

// @return Value of the noise, range: [0, 1]
vec2 hash2D(vec2 x)
{
    // based on: Inigo Quilez, Integer Hash - III, 2017
    uvec4 q = uvec2(x * 8192.0).xyyx + uvec2(0u, 3115245u).xxyy;
    q = 1103515245u * ((q >> 1u) ^ q.yxwz);
    uvec2 n = 1103515245u * (q.xz ^ (q.yw >> 3u));
    return vec2(n) * (1.0 / float(0xffffffffu));
}

// @return Value of the noise, range: [0, 1]
vec3 hash3D(vec2 x) 
{
    // based on: pcg3 by Mark Jarzynski: http://www.jcgt.org/published/0009/03/02/
    uvec3 v = uvec3(x.xyx * 8192.0) * 1664525u + 1013904223u;
    v += v.yzx * v.zxy;
    v ^= v >> 16u;

    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return vec3(v) * (1.0 / float(0xffffffffu));
}

// @return Value of the noise, range: [0, 1]
vec3 hash3D(vec3 x) 
{
    // based on: pcg3 by Mark Jarzynski: http://www.jcgt.org/published/0009/03/02/
    uvec3 v = uvec3(x * 8192.0) * 1664525u + 1013904223u;
    v += v.yzx * v.zxy;
    v ^= v >> 16u;

    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return vec3(v) * (1.0 / float(0xffffffffu));
}

// @return Value of the noise, range: [0, 1]
vec4 hash4D(vec2 x)
{
    // based on: pcg4 by Mark Jarzynski: http://www.jcgt.org/published/0009/03/02/
    uvec4 v = uvec4(x.xyyx * 8192.0) * 1664525u + 1013904223u;

    v += v.yzxy * v.wxyz;
    v.x += v.y * v.w;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v.w += v.y * v.z;
    
    v.x += v.y * v.w;
    v.w += v.y * v.z;
    
    v ^= v >> 16u;

    return vec4(v ^ (v >> 16u)) * (1.0 / float(0xffffffffu));
}

// @return Value of the noise, range: [0, 1]
vec4 hash4D(vec4 x)
{
    // based on: pcg4 by Mark Jarzynski: http://www.jcgt.org/published/0009/03/02/
    uvec4 v = uvec4(x * 8192.0) * 1664525u + 1013904223u;

    v += v.yzxy * v.wxyz;
    v.x += v.y * v.w;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v.w += v.y * v.z;
    
    v.x += v.y * v.w;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v.w += v.y * v.z;

    v ^= v >> 16u;

    return vec4(v ^ (v >> 16u)) * (1.0 / float(0xffffffffu));
}

// ---- ShaderMaker 补充：warp.glsl 的 curlWarp 用 float 调 hash2D（原函数只收 vec2），补一个转发重载 ----
vec2 hash2D(float x) { return hash2D(vec2(x)); }

// ---- multiHash.glsl ----
// based on GPU Texture-Free Noise by Brian Sharpe: https://archive.is/Hn54S
vec3 permutePrepareMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permutePrepareMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permuteResolve(vec4 x) { return fract( x * (7.0 / 288.0 )); }
vec4 permuteHashInternal(vec4 x) { return fract(x * ((34.0 / 289.0) * x + (1.0 / 289.0))) * 289.0; }

// generates a random number for each of the 4 cell corners
vec4 permuteHash2D(vec4 cell)    
{
    cell = permutePrepareMod289(cell * 32.0);
    return permuteResolve(permuteHashInternal(permuteHashInternal(cell.xzxz) + cell.yyww));
}

// generates 2 random numbers for each of the 4 cell corners
void permuteHash2D(vec4 cell, out vec4 hashX, out vec4 hashY)
{
    cell = permutePrepareMod289(cell);
    hashX = permuteHashInternal(permuteHashInternal(cell.xzxz) + cell.yyww);
    hashY = permuteResolve(permuteHashInternal(hashX));
    hashX = permuteResolve(hashX);
}

// generates 2 random numbers for the coordinate
vec2 betterHash2D(vec2 x)
{
    uvec2 q = uvec2(x);
    uint h0 = ihash1D(ihash1D(q.x) + q.y);
    uint h1 = h0 * 1933247u + ~h0 ^ 230123u;
    return vec2(h0, h1)  * (1.0 / float(0xffffffffu));
}

// generates a random number for each of the 4 cell corners
vec4 betterHash2D(vec4 cell)    
{
    uvec4 i = uvec4(cell);
    uvec4 hash = ihash1D(ihash1D(i.xzxz) + i.yyww);
    return vec4(hash) * (1.0 / float(0xffffffffu));
}

// generates 2 random numbers for each of the 4 cell corners
void betterHash2D(vec4 cell, out vec4 hashX, out vec4 hashY)
{
    uvec4 i = uvec4(cell);
    uvec4 hash0 = ihash1D(ihash1D(i.xzxz) + i.yyww);
    uvec4 hash1 = ihash1D(hash0 ^ 1933247u);
    hashX = vec4(hash0) * (1.0 / float(0xffffffffu));
    hashY = vec4(hash1) * (1.0 / float(0xffffffffu));
}

// generates 2 random numbers for each of the 2D coordinates
vec4 betterHash2D(vec2 coords0, vec2 coords1)
{
    uvec4 i = uvec4(coords0, coords1);
    uvec4 hash = ihash1D(ihash1D(i.xz) + i.yw).xxyy;
    hash.yw = hash.yw * 1933247u + ~hash.yw ^ 230123u;
    return vec4(hash) * (1.0 / float(0xffffffffu));;
}

// generates 2 random numbers for each of the four 2D coordinates
void betterHash2D(vec4 coords0, vec4 coords1, out vec4 hashX, out vec4 hashY)
{
    uvec4 hash0 = ihash1D(ihash1D(uvec4(coords0.xz, coords1.xz)) + uvec4(coords0.yw, coords1.yw));
    uvec4 hash1 = hash0 * 1933247u + ~hash0 ^ 230123u;
    hashX = vec4(hash0) * (1.0 / float(0xffffffffu));
    hashY = vec4(hash1) * (1.0 / float(0xffffffffu));
} 

// 3D

// generates a random number for each of the 8 cell corners
void permuteHash3D(vec3 cell, vec3 cellPlusOne, out vec4 lowHash, out vec4 highHash)     
{
    cell = permutePrepareMod289(cell);
    cellPlusOne = step(cell, vec3(287.5)) * cellPlusOne;

    highHash = permuteHashInternal(permuteHashInternal(vec2(cell.x, cellPlusOne.x).xyxy) + vec2(cell.y, cellPlusOne.y).xxyy);
    lowHash = permuteResolve(permuteHashInternal(highHash + cell.zzzz));
    highHash = permuteResolve(permuteHashInternal(highHash + cellPlusOne.zzzz));
}

// generates a random number for each of the 8 cell corners
void fastHash3D(vec3 cell, vec3 cellPlusOne, out vec4 lowHash, out vec4 highHash)
{
    // based on: https://archive.is/wip/7j1wv
    const vec2 kOffset = vec2(50.0, 161.0);
    const float kDomainScale = 289.0;
    const float kLargeValue = 635.298681;
    const float kk = 48.500388;
    
    //truncate the domain, equivalant to mod(cell, kDomainScale)
    cell -= floor(cell.xyz * (1.0 / kDomainScale)) * kDomainScale;
    cellPlusOne = step(cell, vec3(kDomainScale - 1.5)) * cellPlusOne;

    vec4 r = vec4(cell.xy, cellPlusOne.xy) + kOffset.xyxy;
    r *= r;
    r = r.xzxz * r.yyww;
    highHash.xy = vec2(1.0 / (kLargeValue + vec2(cell.z, cellPlusOne.z) * kk));
    lowHash = fract(r * highHash.xxxx);
    highHash = fract(r * highHash.yyyy);
}

// generates a random number for each of the 8 cell corners
void betterHash3D(vec3 cell, vec3 cellPlusOne, out vec4 lowHash, out vec4 highHash)
{
    uvec4 cells = uvec4(cell.xy, cellPlusOne.xy);  
    uvec4 hash = ihash1D(ihash1D(cells.xzxz) + cells.yyww);
    
    lowHash = vec4(ihash1D(hash + uint(cell.z))) * (1.0 / float(0xffffffffu));
    highHash = vec4(ihash1D(hash + uint(cellPlusOne.z))) * (1.0 / float(0xffffffffu));
}

// @note Can change to (faster to slower order): permuteHash2D, betterHash2D
// Each has a tradeoff between quality and speed, some may also experience artifacts for certain ranges and are not realiable.
#define multiHash2D betterHash2D

// @note Can change to (faster to slower order): fastHash3D, permuteHash3D, betterHash3D
// Each has a tradeoff between quality and speed, some may also experience artifacts for certain ranges and are not realiable.
#define multiHash3D betterHash3D

void smultiHash2D(vec4 cell, out vec4 hashX, out vec4 hashY)
{
    multiHash2D(cell, hashX, hashY);
    hashX = hashX * 2.0 - 1.0; 
    hashY = hashY * 2.0 - 1.0;
}

// ---- interpolate.glsl ----
// the main noise interpolation function using a hermite polynomial
float noiseInterpolate(const in float x) 
{ 
    float x2 = x * x;
    return x2 * x * (x * (x * 6.0 - 15.0) + 10.0); 
}
vec2 noiseInterpolate(const in vec2 x) 
{ 
    vec2 x2 = x * x;
    return x2 * x * (x * (x * 6.0 - 15.0) + 10.0); 
}
vec3 noiseInterpolate(const in vec3 x) 
{ 
    vec3 x2 = x * x;
    return x2 * x * (x * (x * 6.0 - 15.0) + 10.0); 
}
vec4 noiseInterpolate(const in vec4 x) 
{ 
    vec4 x2 = x * x;
    return x2 * x * (x * (x * 6.0 - 15.0) + 10.0); 
}
vec2 noiseInterpolateDu(const in float x) 
{ 
    float x2 = x * x;
    float u = x2 * x * (x * (x * 6.0 - 15.0) + 10.0); 
    float du = 30.0 * x2 * (x * (x - 2.0) + 1.0);
    return vec2(u, du);
}
vec4 noiseInterpolateDu(const in vec2 x) 
{ 
    vec2 x2 = x * x;
    vec2 u = x2 * x * (x * (x * 6.0 - 15.0) + 10.0); 
    vec2 du = 30.0 * x2 * (x * (x - 2.0) + 1.0);
    return vec4(u, du);
}
void noiseInterpolateDu(const in vec3 x, out vec3 u, out vec3 du) 
{ 
    vec3 x2 = x * x;
    u = x2 * x * (x * (x * 6.0 - 15.0) + 10.0); 
    du = 30.0 * x2 * (x * (x - 2.0) + 1.0);
}

// ---- metric.glsl ----
float distanceMetric(vec2 pos, uint metric)
{
    switch (metric)
    {
        case 0u:
            // squared euclidean
            return dot(pos, pos);
        case 1u:
            // manhattam   
            return dot(abs(pos), vec2(1.0));
        case 2u:
            // chebyshev
            return max(abs(pos.x), abs(pos.y));
        default:
            // triangular
            return  max(abs(pos.x) * 0.866025 + pos.y * 0.5, -pos.y);
    }
}

vec4 distanceMetric(vec4 px, vec4 py, uint metric)
{
    switch (metric)
    {
        case 0u:
            // squared euclidean
            return px * px + py * py;
        case 1u:
            // manhattam   
            return abs(px) + abs(py);
        case 2u:
            // chebyshev
            return max(abs(px), abs(py));
        default:
            // triangular
            return max(abs(px) * 0.866025 + py * 0.5, -py);
    }
}

// ---- ShaderMaker 补充：noise.glsl / fbm.glsl 有几处用 float seed 调 multiNoise（原函数只收 vec2），补一个转发重载 ----
vec2 multiNoise(vec4 pos, vec4 scale, float phase, vec2 seed);
vec2 multiNoise(vec4 pos, vec4 scale, float phase, float seed) { return multiNoise(pos, scale, phase, vec2(seed)); }

// ---- noise.glsl ----
// 1D Value noise.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param seed Seed to randomize result, range: [0, inf]
// @return Value of the noise, range: [-1, 1]
float noise(float pos, float scale, float seed)
{
    pos *= scale;
    vec2 i = floor(pos) + vec2(0.0, 1.0);
    float f = pos - i.x;
    i = mod(i, vec2(scale)) + seed;

    float u = noiseInterpolate(f);
    return mix(hash1D(i.x), hash1D(i.y), u) * 2.0 - 1.0;
}

// 2D Value noise.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param seed Seed to randomize result, range: [0, inf]
// @return Value of the noise, range: [-1, 1]
float noise(vec2 pos, vec2 scale, float seed) 
{
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec2 f = pos - i.xy;
    i = mod(i, scale.xyxy) + seed;

    vec4 hash = multiHash2D(i);
    float a = hash.x;
    float b = hash.y;
    float c = hash.z;
    float d = hash.w;

    vec2 u = noiseInterpolate(f);
    float value = mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    return value * 2.0 - 1.0;
}

// 2D Value noise.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param phase The phase for rotating the hash, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf]
// @return Value of the noise, range: [-1, 1]
float noise(vec2 pos, vec2 scale, float phase, float seed) 
{
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec2 f = pos - i.xy;
    i = mod(i, scale.xyxy) + seed;

    vec4 hash = multiHash2D(i);
    hash = 0.5 * sin(phase + kPI2 * hash) + 0.5;
    float a = hash.x;
    float b = hash.y;
    float c = hash.z;
    float d = hash.w;

    vec2 u = noiseInterpolate(f);
    float value = mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    return value * 2.0 - 1.0;
}

// 2D Value noise with derivatives.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param seed Seed to randomize result, range: [0, inf]
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 noised(vec2 pos, vec2 scale, float seed) 
{
    // value noise with derivatives based on Inigo Quilez
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec2 f = pos - i.xy;
    i = mod(i, scale.xyxy) + seed;

    vec4 hash = multiHash2D(i);
    float a = hash.x;
    float b = hash.y;
    float c = hash.z;
    float d = hash.w;
    
    vec4 udu = noiseInterpolateDu(f);    
    float abcd = a - b - c + d;
    float value = a + (b - a) * udu.x + (c - a) * udu.y + abcd * udu.x * udu.y;
    vec2 derivative = udu.zw * (udu.yx * abcd + vec2(b, c) - a);
    return vec3(value * 2.0 - 1.0, derivative);
}

// 2D Value noise with derivatives.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param phase The phase for rotating the hash, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf]
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 noised(vec2 pos, vec2 scale, float phase, float seed) 
{
    const float kPI2 = 6.2831853071;
    // value noise with derivatives based on Inigo Quilez
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec2 f = pos - i.xy;
    i = mod(i, scale.xyxy) + seed;

    vec4 hash = multiHash2D(i);
    hash = 0.5 * sin(phase + kPI2 * hash) + 0.5;
    float a = hash.x;
    float b = hash.y;
    float c = hash.z;
    float d = hash.w;
    
    vec4 udu = noiseInterpolateDu(f);    
    float abcd = a - b - c + d;
    float value = a + (b - a) * udu.x + (c - a) * udu.y + abcd * udu.x * udu.y;
    vec2 derivative = udu.zw * (udu.yx * abcd + vec2(b, c) - a);
    return vec3(value * 2.0 - 1.0, derivative);
}

// 3D Value noise with height that is tileable on the XY axis.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param time The height phase for the noise value, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Value of the noise, range: [-1, 1]
float noise3d(vec2 pos, vec2 scale, float height, float seed)
{
    // classic value noise with 3D
    pos *= scale;
    vec3 i = floor(vec3(pos, height));
    vec3 ip1 = i + vec3(1.0);
    vec3 f = vec3(pos, height) - i;
    
    vec4 mi = mod(vec4(i.xy, ip1.xy), scale.xyxy);
    i.xy = mi.xy;
    ip1.xy = mi.zw;

    vec4 hashLow, hashHigh;
    multiHash3D(i + seed, ip1 + seed, hashLow, hashHigh);
    
    vec3 u = noiseInterpolate(f);
    vec4 r = mix(hashLow, hashHigh, u.z);
    r = mix(r.xyxz, r.zwyw, u.yyxx);
    return (r.x + (r.y - r.x) * u.x) * 2.0 - 1.0;
}

// 3D Value noise with height and derivatives that is tileable on the XY axis.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param time The height phase for the noise value, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf]
// @return x = value of the noise, yz = derivative of the noise, w = derivative of the time, range: [-1, 1]
vec4 noised3d(vec2 pos, vec2 scale, float time, float seed) 
{
    // based on Analytical Noise Derivatives by Brian Sharpe
    // classic value noise with 3D
    pos *= scale;
    vec3 i = floor(vec3(pos, time));
    vec3 ip1 = i + vec3(1.0);
    vec3 f = vec3(pos, time) - i;
    
    vec4 mi = mod(vec4(i.xy, ip1.xy), scale.xyxy);
    i.xy = mi.xy;
    ip1.xy = mi.zw;

    vec4 hashLow, hashHigh;
    multiHash3D(i + seed, ip1 + seed, hashLow, hashHigh);

    vec3 u, du;
    noiseInterpolateDu(f, u, du);
    vec4 res0 = mix(hashLow, hashHigh, u.z);
    vec4 res1 = mix(res0.xyxz, res0.zwyw, u.yyxx);
    vec4 res2 = mix(vec4(hashLow.xy, hashHigh.xy), vec4(hashLow.zw, hashHigh.zw), u.y);
    vec2 res3 = mix(res2.xz, res2.yw, u.x);
    vec4 results = vec4(res1.x, 0.0, 0.0, 0.0) + (vec4(res1.yyw, res3.y) - vec4(res1.xxz, res3.x)) * vec4(u.x, du);
    return vec4(results.x * 2.0 - 1.0, results.yzw);
}

// 2D Value noise that returns two values.
// @param scale Number of tiles, must be an integer for tileable results, range: [2, inf]
// @param phase The phase for rotating the hash, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf]
// @return Value of the noise, range: [-1, 1]
vec2 multiNoise(vec4 pos, vec4 scale, float phase, vec2 seed) 
{
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec4 i = floor(pos);
    vec4 f = pos - i;
    vec4 i0 = mod(i.xyxy + vec2(0.0, 1.0).xxyy, scale.xyxy) + seed.x;
    vec4 i1 = mod(i.zwzw + vec2(0.0, 1.0).xxyy, scale.xyxy) + seed.y;

    vec4 hash0 = multiHash2D(i0);
    hash0 = 0.5 * sin(phase + kPI2 * hash0) + 0.5;
    vec4 hash1 = multiHash2D(i1);
    hash1 = 0.5 * sin(phase + kPI2 * hash1) + 0.5;
    vec2 a = vec2(hash0.x, hash1.x);
    vec2 b = vec2(hash0.y, hash1.y);
    vec2 c = vec2(hash0.z, hash1.z);
    vec2 d = vec2(hash0.w, hash1.w);

    vec4 u = noiseInterpolate(f);
    vec2 value = mix(a, b, u.xz) + (c - a) * u.yw * (1.0 - u.xz) + (d - b) * u.xz * u.yw;
    return value * 2.0 - 1.0;
}

// 2D Variant of Value noise that produces ridge-like noise by using multiple noise values.
// @param scale Number of tiles, must be integer for tileable results, range: [2, inf]
// @param translate Translate factors for the value noise , range: [-inf, inf], default: {0.5, -0.25, 0.15}
// @param intensity The contrast for the noise, range: [0, 1], default: 0.75
// @param time The height phase for the noise value, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf]
// @return Value of the noise, range: [0, 1]
float gridNoise(vec2 pos, vec2 scale, vec3 translate, float intensity, float time, float seed)
{
    vec4 n; 
    n.xy = multiNoise(pos.xyxy + vec2(0.0, translate.x).xxyy, scale.xyxy, time, seed);
    n.zw = multiNoise(pos.xyxy + translate.yyzz, scale.xyxy, time, seed);
    n.xy = n.xy * n.zw;
    
    float t = abs(n.x * n.y);
    return pow(t, mix(0.5, 0.1, intensity));
}

// 2D Variant of Value noise that produces ridge-like noise by using multiple noise values.
// @param scale Number of tiles, must be integer for tileable results, range: [2, inf]
// @param intensity The contrast for the noise, range: [0, 1], default: 0.75
// @param time The height phase for the noise value, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf]
// @return Value of the noise, range: [0, 1]
float gridNoise(vec2 pos, vec2 scale, float intensity, float time, float seed)
{
    vec4 translate = vec4(0.0, (hash3D(vec2(seed)) * 2.0 - 1.0) * scale.xyx);
    
    vec4 n; 
    n.xy = multiNoise(pos.xyxy + translate.xxyy, scale.xyxy, time, seed);
    n.zw = multiNoise(pos.xyxy + translate.zzww, scale.xyxy, time, seed);
    n.xy = n.xy * n.zw;
    
    float t = abs(n.x * n.y);
    return pow(t, mix(0.5, 0.1, intensity));
}

// 2D Variant of Value noise that produces dots with random size or luminance.
// @param scale Number of tiles, must be integer for tileable results, range: [2, inf]
// @param density The density of the dots distribution, range: [0, 1], default: 1.0
// @param size The radius of the dots, range: [0, 1], default: 0.5
// @param sizeVariation The variation for the size of the dots, range: [0, 1], default: 0.75
// @param roundness The roundness of the dots, if zero will result in square, range: [0, 1], default: 1.0
// @param seed Seed to randomize result, range: [0, inf]
// @return x = value of the noise, y = random luminance value, z = size of the dot, range: [0, 1]
vec3 dotsNoise(vec2 pos, vec2 scale, float density, float size, float sizeVariation, float roundness, float seed) 
{
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec2 f = pos - i.xy;
    i = mod(i, scale.xyxy);
    
    vec4 hash = hash4D(i.xy + seed);
    if (hash.w > density)
        return vec3(0.0);

    float radius = clamp(size + (hash.z * 2.0 - 1.0) * sizeVariation * 0.5, 0.0, 1.0);
    float value = radius / size;  
    radius = 2.0 / radius;
    f = f * radius - (radius - 1.0);
    f += hash.xy * (radius - 2.0);
    f = pow(abs(f), vec2((mix(20.0, 1.0, sqrt(roundness)))));

    float u = 1.0 - min(dot(f, f), 1.0);
    return vec3(clamp(u * u * u * value, 0.0, 1.0), hash.w, hash.z);
}

// 2D Variant of Value noise that produces lines of random color and configurable width.
// @param scale Number of tiles, must be integer for tileable results, range: [2, inf]
// @param count The density of the lines, range: [1, inf], default: 4.0
// @param jitter Jitter factor for the lines, if zero then it will result straight lines, range: [0, 1], default: 1.0
// @param smoothness The radius of the dots, range: [0, 1], default: 0.5
// @param seed Seed to randomize result, range: [0, inf]
// @return x = value of the noise, range: [0, 1], y = id of lines, range: [0, count] 
vec2 randomLines(vec2 pos, vec2 scale, float count, float width, float jitter, vec2 smoothness, float phase, float seed)
{
    float strength = jitter * 1.25;

    // compute gradient
    // TODO: compute the gradient analytically
    vec2 grad;
    vec3 offsets = vec3(1.0, 0.0, -1.0) / 1024.0;
    vec4 p = pos.xyxy + offsets.xyzy;
    vec2 nv = count * (strength * multiNoise(p, scale.xyxy, phase, vec2(seed)) + p.yw);
    grad.x = nv.x - nv.y;
    p = pos.xyxy + offsets.yxyz;
    nv = count * (strength * multiNoise(p, scale.xyxy, phase, vec2(seed)) + p.yw);
    grad.y = nv.x - nv.y;
    
    float v =  count * (strength * noise(pos, scale, phase, seed) + pos.y);
    float w = fract(v) / length(grad / (2.0 * offsets.x));
    width *= 0.1;
    smoothness *= width;
    smoothness += max(abs(grad.x), abs(grad.y)) * 0.02;
    
    float d = smoothstep(0.0, smoothness.x, w) - smoothstep(max(width - smoothness.y, 0.0), width, w);
    return vec2(d, mod(floor(v), count));
}

// 2D Variant of Value noise that produces lines of random color and configurable width.
// @param scale Number of tiles, must be integer for tileable results, range: [2, inf]
// @param count The density of the lines, range: [1, inf], default: 4.0
// @param jitter Jitter factor for the lines, if zero then it will result straight lines, range: [0, 1], default: 1.0
// @param smoothness The radius of the dots, range: [0, 1], default: 0.5
// @param colorVariation The variation for the color of the lines, range: [0, 1], default: 1.0
// @param seed Seed to randomize result, range: [0, inf]
// @return Color of the lines, black if background, range: [0, 1]
vec4 randomLines(vec2 pos, vec2 scale, float count, float width, float jitter, vec2 smoothness, float phase, float colorVariation, float seed)
{
    vec2 l = randomLines(pos, scale, count, width, jitter, smoothness, phase, seed);
    vec3 r = hash3D(l.yy + seed);
    return vec4(l.x * (r.x <= colorVariation ? r : r.xxx), l.x);
}

// ---- gradientNoise.glsl ----
// 2D Gradient noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Value of the noise, range: [-1, 1]
float gradientNoise(vec2 pos, vec2 scale, float seed) 
{
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;

    vec4 hashX, hashY;
    smultiHash2D(i, hashX, hashY);

    vec4 gradients = hashX * f.xzxz + hashY * f.yyww;
    vec2 u = noiseInterpolate(f.xy);
    vec2 g = mix(gradients.xz, gradients.yw, u.x);
    return 1.4142135623730950 * mix(g.x, g.y, u.y);
}

// 2D Gradient noise with gradients transform (i.e. can be used to rotate the gradients).
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param transform Transform matrix for the noise gradients.
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Value of the noise, range: [-1, 1]
float gradientNoise(vec2 pos, vec2 scale, mat2 transform, float seed) 
{
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;
    
    vec4 hashX, hashY;
    smultiHash2D(i, hashX, hashY);

    // transform gradients
    vec4 m = vec4(transform);
    vec4 rh = vec4(hashX.x, hashY.x, hashX.y, hashY.y);
    rh = rh.xxzz * m.xyxy + rh.yyww * m.zwzw;
    hashX.xy = rh.xz;
    hashY.xy = rh.yw;

    rh = vec4(hashX.z, hashY.z, hashX.w, hashY.w);
    rh = rh.xxzz * m.xyxy + rh.yyww * m.zwzw;
    hashX.zw = rh.xz;
    hashY.zw = rh.yw;
    
    vec4 gradients = hashX * f.xzxz + hashY * f.yyww;
    vec2 u = noiseInterpolate(f.xy);
    vec2 g = mix(gradients.xz, gradients.yw, u.x);
    return 1.4142135623730950 * mix(g.x, g.y, u.y);
}

float gradientNoise(vec2 pos, vec2 scale, float rotation, float seed) 
{
    vec2 sinCos = vec2(sin(rotation), cos(rotation));
    return gradientNoise(pos, scale, mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y), seed);
}

// 2D Gradient noise with derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 gradientNoised(vec2 pos, vec2 scale, float seed) 
{
    // gradient noise with derivatives based on Inigo Quilez
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;
    
    vec4 hashX, hashY;
    smultiHash2D(i, hashX, hashY);
    vec2 a = vec2(hashX.x, hashY.x);
    vec2 b = vec2(hashX.y, hashY.y);
    vec2 c = vec2(hashX.z, hashY.z);
    vec2 d = vec2(hashX.w, hashY.w);
    
    vec4 gradients = hashX * f.xzxz + hashY * f.yyww;

    vec4 udu = noiseInterpolateDu(f.xy);
    vec2 u = udu.xy;
    vec2 g = mix(gradients.xz, gradients.yw, u.x);
    
    vec2 dxdy = a + u.x * (b - a) + u.y * (c - a) + u.x * u.y * (a - b - c + d);
    dxdy += udu.zw * (u.yx * (gradients.x - gradients.y - gradients.z + gradients.w) + gradients.yz - gradients.x);
    return vec3(mix(g.x, g.y, u.y) * 1.4142135623730950, dxdy);
}

// 2D Gradient noise with gradients transform (i.e. can be used to rotate the gradients) and derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param transform Transform matrix for the noise gradients.
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 gradientNoised(vec2 pos, vec2 scale, mat2 transform, float seed) 
{
    // gradient noise with derivatives based on Inigo Quilez
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;
    
    vec4 hashX, hashY;
    smultiHash2D(i, hashX, hashY);

    // transform gradients
    vec4 m = vec4(transform);
    vec4 rh = vec4(hashX.x, hashY.x, hashX.y, hashY.y);
    rh = rh.xxzz * m.xyxy + rh.yyww * m.zwzw;
    hashX.xy = rh.xz;
    hashY.xy = rh.yw;

    rh = vec4(hashX.z, hashY.z, hashX.w, hashY.w);
    rh = rh.xxzz * m.xyxy + rh.yyww * m.zwzw;
    hashX.zw = rh.xz;
    hashY.zw = rh.yw;
    
    vec2 a = vec2(hashX.x, hashY.x);
    vec2 b = vec2(hashX.y, hashY.y);
    vec2 c = vec2(hashX.z, hashY.z);
    vec2 d = vec2(hashX.w, hashY.w);
    
    vec4 gradients = hashX * f.xzxz + hashY * f.yyww;

    vec4 udu = noiseInterpolateDu(f.xy);
    vec2 u = udu.xy;
    vec2 g = mix(gradients.xz, gradients.yw, u.x);
    
    vec2 dxdy = a + u.x * (b - a) + u.y * (c - a) + u.x * u.y * (a - b - c + d);
    dxdy += udu.zw * (u.yx * (gradients.x - gradients.y - gradients.z + gradients.w) + gradients.yz - gradients.x);
    return vec3(mix(g.x, g.y, u.y) * 1.4142135623730950, dxdy);
}

// 2D Gradient noise with gradients rotation and derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param rotation Rotation for the noise gradients, useful to animate flow, range: [0, PI]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 gradientNoised(vec2 pos, vec2 scale, float rotation, float seed) 
{
    vec2 sinCos = vec2(sin(rotation), cos(rotation));
    return gradientNoised(pos, scale, mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y), seed);
}

// Variant of 2D Gradient noise with disorder/jitter for the gradients.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param disoder Jitter factor for the noise gradients,, range: [0, 1.0]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
float gradientNoiseDisorder(vec2 pos, vec2 scale, float disoder, float seed) 
{
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;

    vec4 hashX, hashY;
    multiHash2D(i, hashX, hashY);
    hashX = (hashX * disoder) * 2.0 - 1.0;
    hashY = (hashY * disoder) * 2.0 - 1.0;

    vec4 gradients = hashX * f.xzxz + hashY * f.yyww;
    vec2 u = noiseInterpolate(f.xy);
    vec2 g = mix(gradients.xz, gradients.yw, u.x);
    return 1.4142135623730950 * mix(g.x, g.y, u.y);
}

// ---- perlinNoise.glsl ----
// 2D Perlin noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Value of the noise, range: [-1, 1]
float perlinNoise(vec2 pos, vec2 scale, float seed)
{
    // based on Modifications to Classic Perlin Noise by Brian Sharpe: https://archive.is/cJtlS
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;

    // grid gradients
    vec4 gradientX, gradientY;
    multiHash2D(i, gradientX, gradientY);
    gradientX -= 0.49999;
    gradientY -= 0.49999;

    // perlin surflet
    vec4 gradients = inversesqrt(gradientX * gradientX + gradientY * gradientY) * (gradientX * f.xzxz + gradientY * f.yyww);
    // normalize: 1.0 / 0.75^3
    gradients *= 2.3703703703703703703703703703704;
    vec4 lengthSq = f * f;
    lengthSq = lengthSq.xzxz + lengthSq.yyww;
    vec4 xSq = 1.0 - min(vec4(1.0), lengthSq); 
    xSq = xSq * xSq * xSq;
    return dot(xSq, gradients);
}

// 2D Perlin noise with gradients transform (i.e. can be used to rotate the gradients).
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param transform transform matrix for the noise gradients.
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Value of the noise, range: [-1, 1]
float perlinNoise(vec2 pos, vec2 scale, mat2 transform, float seed)
{
    // based on Modifications to Classic Perlin Noise by Brian Sharpe: https://archive.is/cJtlS
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;

    // grid gradients
    vec4 gradientX, gradientY;
    multiHash2D(i, gradientX, gradientY);
    gradientX -= 0.49999;
    gradientY -= 0.49999;

    // transform gradients
    vec4 mt = vec4(transform);
    vec4 rg = vec4(gradientX.x, gradientY.x, gradientX.y, gradientY.y);
    rg = rg.xxzz * mt.xyxy + rg.yyww * mt.zwzw;
    gradientX.xy = rg.xz;
    gradientY.xy = rg.yw;

    rg = vec4(gradientX.z, gradientY.z, gradientX.w, gradientY.w);
    rg = rg.xxzz * mt.xyxy + rg.yyww * mt.zwzw;
    gradientX.zw = rg.xz;
    gradientY.zw = rg.yw;

    // perlin surflet
    vec4 gradients = inversesqrt(gradientX * gradientX + gradientY * gradientY) * (gradientX * f.xzxz + gradientY * f.yyww);
    // normalize: 1.0 / 0.75^3
    gradients *= 2.3703703703703703703703703703704;
    f = f * f;
    f = f.xzxz + f.yyww;
    vec4 xSq = 1.0 - min(vec4(1.0), f); 
    return dot(xSq * xSq * xSq, gradients);
}

// 2D Perlin noise with gradients rotation.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param rotation Rotation for the noise gradients, useful to animate flow, range: [0, PI]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Value of the noise, range: [-1, 1]
float perlinNoise(vec2 pos, vec2 scale, float rotation, float seed) 
{
    vec2 sinCos = vec2(sin(rotation), cos(rotation));
    return perlinNoise(pos, scale, mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y), seed);
}

// 2D Perlin noise with derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 perlinNoised(vec2 pos, vec2 scale, float seed)
{
    // based on Modifications to Classic Perlin Noise by Brian Sharpe: https://archive.is/cJtlS
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;

    // grid gradients
    vec4 gradientX, gradientY;
    multiHash2D(i, gradientX, gradientY);
    gradientX -= 0.49999;
    gradientY -= 0.49999;

    // perlin surflet
    vec4 gradients = inversesqrt(gradientX * gradientX + gradientY * gradientY) * (gradientX * f.xzxz + gradientY * f.yyww);
    vec4 m = f * f;
    m = m.xzxz + m.yyww;
    m = max(1.0 - m, 0.0);
    vec4 m2 = m * m;
    vec4 m3 = m * m2;
    // compute the derivatives
    vec4 m2Gradients = -6.0 * m2 * gradients;
    vec2 grad = vec2(dot(m2Gradients, f.xzxz), dot(m2Gradients, f.yyww)) + vec2(dot(m3, gradientX), dot(m3, gradientY));
    // sum the surflets and normalize: 1.0 / 0.75^3
    return vec3(dot(m3, gradients), grad) * 2.3703703703703703703703703703704;
}

// 2D Perlin noise with derivatives and gradients transform (i.e. can be used to rotate the gradients).
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param rotation Rotation for the noise gradients, useful to animate flow, range: [0, PI]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 perlinNoised(vec2 pos, vec2 scale, mat2 transform, float seed)
{
    // based on Modifications to Classic Perlin Noise by Brian Sharpe: https://archive.is/cJtlS
    pos *= scale;
    vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
    vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
    i = mod(i, scale.xyxy) + seed;

    // grid gradients
    vec4 gradientX, gradientY;
    multiHash2D(i, gradientX, gradientY);
    gradientX -= 0.49999;
    gradientY -= 0.49999;

    // transform gradients
    vec4 mt = vec4(transform);
    vec4 rg = vec4(gradientX.x, gradientY.x, gradientX.y, gradientY.y);
    rg = rg.xxzz * mt.xyxy + rg.yyww * mt.zwzw;
    gradientX.xy = rg.xz;
    gradientY.xy = rg.yw;

    rg = vec4(gradientX.z, gradientY.z, gradientX.w, gradientY.w);
    rg = rg.xxzz * mt.xyxy + rg.yyww * mt.zwzw;
    gradientX.zw = rg.xz;
    gradientY.zw = rg.yw;

    // perlin surflet
    vec4 gradients = inversesqrt(gradientX * gradientX + gradientY * gradientY) * (gradientX * f.xzxz + gradientY * f.yyww);
    vec4 m = f * f;
    m = m.xzxz + m.yyww;
    m = max(1.0 - m, 0.0);
    vec4 m2 = m * m;
    vec4 m3 = m * m2;
    // compute the derivatives
    vec4 m2Gradients = -6.0 * m2 * gradients;
    vec2 grad = vec2(dot(m2Gradients, f.xzxz), dot(m2Gradients, f.yyww)) + vec2(dot(m3, gradientX), dot(m3, gradientY));
    // sum the surflets and normalize: 1.0 / 0.75^3
    return vec3(dot(m3, gradients), grad) * 2.3703703703703703703703703703704;
}

// 2D Perlin noise with derivatives and gradients rotation.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param rotation Rotation for the noise gradients, useful to animate flow, range: [0, PI]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 perlinNoised(vec2 pos, vec2 scale, float rotation, float seed) 
{
    vec2 sinCos = vec2(sin(rotation), cos(rotation));
    return perlinNoised(pos, scale, mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y), seed);
}

// 2D Variant of Perlin noise that produces and organic-like noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param density The density of the lower frequency details, range: [0, 1], default: 1.0
// @param phase The phase of the noise, range: [-inf, inf], default: {0, 0}
// @param contrast Controls the contrast of the result, range: [0, 1], default: 0.0
// @param highlights Controls the highlights of the , range: [0, 1], default: 0.25
// @param shift Shifts the angle of the highlights, range: [0, 1], default: 0.5
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Value of the noise, range: [0, 1]
float organicNoise(vec2 pos, vec2 scale, float density, vec2 phase, float contrast, float highlights, float shift, float seed)
{
    vec2 s = mix(vec2(1.0), scale - 1.0, density);
    float nx = perlinNoise(pos + phase, scale, seed);
    float ny = perlinNoise(pos, s, seed);

    float n = length(vec2(nx, ny) * mix(vec2(2.0, 0.0), vec2(0.0, 2.0), shift));
    n = pow(n, 1.0 + 8.0 * contrast) + (0.15 * highlights) / n;
    return n * 0.5;
}

// ---- cellularNoise.glsl ----
// Classic 3x3 Cellular noise with F1 and F2 distances.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the cellular distances, x = F1, y = F2, range: [0, 1].
vec2 cellularNoise(vec2 pos, vec2 scale, float jitter, float seed) 
{       
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);
    
    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = dx0 * dx0 + dy0 * dy0; 
    vec4 d1 = dx1 * dx1 + dy1 * dy1; 
    
    vec2 centerPos = multiHash2D(i) * jitter - f; // 0 0
    
    vec4 F = min(d0, d1);
    // shuffle into F the 4 lowest values
    F = min(F, max(d0, d1).wzyx);
    // shuffle into F the 2 lowest values 
    F.xy = min(min(F.xy, F.zw), max(F.xy, F.zw).yx);
    // add the last value
    F.zw = vec2(dot(centerPos, centerPos), 1e+5);
    // shuffle into F the final 2 lowest values 
    F.xy = min(min(F.xy, F.zw), max(F.xy, F.zw).yx);
    
    vec2 f12 = vec2(min(F.x, F.y), max(F.x, F.y));
    // normalize: 0.75^2 * 2.0  == 1.125
    return sqrt(f12) * (1.0 / 1.125);
}

// Classic 3x3 Cellular noise with F1 and F2 distances.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the cellular distances, x = F1, y = F2, range: [0, 1].
vec2 cellularNoise(vec2 pos, vec2 scale, float jitter, float phase, float seed) 
{        
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);
    dx0 = 0.5 * sin(phase + kPI2 * dx0) + 0.5;
    dy0 = 0.5 * sin(phase + kPI2 * dy0) + 0.5;
    dx1 = 0.5 * sin(phase + kPI2 * dx1) + 0.5;
    dy1 = 0.5 * sin(phase + kPI2 * dy1) + 0.5;
    
    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = dx0 * dx0 + dy0 * dy0; 
    vec4 d1 = dx1 * dx1 + dy1 * dy1; 
    
    vec2 centerPos = (0.5 * sin(phase + kPI2 * multiHash2D(i)) + 0.5) * jitter - f; // 0 0
    vec4 F = min(d0, d1);
    // shuffle into F the 4 lowest values
    F = min(F, max(d0, d1).wzyx);
    // shuffle into F the 2 lowest values 
    F.xy = min(min(F.xy, F.zw), max(F.xy, F.zw).yx);
    // add the last value
    F.zw = vec2(dot(centerPos, centerPos), 1e+5);
    // shuffle into F the final 2 lowest values 
    F.xy = min(min(F.xy, F.zw), max(F.xy, F.zw).yx);
    
    vec2 f12 = vec2(min(F.x, F.y), max(F.x, F.y));
    // normalize: 0.75^2 * 2.0  == 1.125
    return sqrt(f12) * (1.0 / 1.125);
}

// Classic 3x3 Cellular noise with F1 and F2 distances with support for multiple metrics.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param metric The distance metric used, can be euclidean, manhattan, chebyshev or triangular, range: [0, 3], default: 0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the cellular distances, x = F1, y = F2, range: [0, 1].
vec2 cellularNoise(vec2 pos, vec2 scale, float jitter, float phase, uint metric, float seed) 
{       
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);
    dx0 = 0.5 * sin(phase + kPI2 * dx0) + 0.5;
    dy0 = 0.5 * sin(phase + kPI2 * dy0) + 0.5;
    dx1 = 0.5 * sin(phase + kPI2 * dx1) + 0.5;
    dy1 = 0.5 * sin(phase + kPI2 * dy1) + 0.5;
    
    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = distanceMetric(dx0, dy0, metric);
    vec4 d1 = distanceMetric(dx1, dy1, metric);
    
    vec2 centerPos = (0.5 * sin(phase + kPI2 * multiHash2D(i)) + 0.5) * jitter - f; // 0 0
    vec4 F = min(d0, d1);
    // shuffle into F the 4 lowest values
    F = min(F, max(d0, d1).wzyx);
    // shuffle into F the 2 lowest values 
    F.xy = min(min(F.xy, F.zw), max(F.xy, F.zw).yx);
    // add the last value
    F.zw = vec2(distanceMetric(centerPos, metric), 1e+5);
    // shuffle into F the final 2 lowest values 
    F.xy = min(min(F.xy, F.zw), max(F.xy, F.zw).yx);
    
    vec2 f12 = vec2(min(F.x, F.y), max(F.x, F.y));
    // normalize: 0.75^2 * 2.0  == 1.125
    return (metric == 0u ? sqrt(f12) : f12) * (1.0 / 1.125);
}

// Classic 3x3 Cellular noise with F1 and F2 distances and derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 cellularNoised(vec2 pos, vec2 scale, float jitter, float seed) 
{       
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);
    
    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = dx0 * dx0 + dy0 * dy0; 
    vec4 d1 = dx1 * dx1 + dy1 * dy1; 
    
    vec2 centerPos = multiHash2D(i) * jitter - f; // 0 0
    float dCenter = dot(centerPos, centerPos);
    vec4 d = min(d0, d1);
    vec4 less = step(d1, d0);
    vec4 dx = mix(dx0, dx1, less);
    vec4 dy = mix(dy0, dy1, less);

    vec3 t1 = d.x < d.y ? vec3(d.x, dx.x, dy.x) : vec3(d.y, dx.y, dy.y);
    vec3 t2 = d.z < d.w ? vec3(d.z, dx.z, dy.z) : vec3(d.w, dx.w, dy.w);
    t2 = t2.x < dCenter ? t2 : vec3(dCenter, centerPos);
    vec3 t = t1.x < t2.x ? t1 : t2;
    t.x = sqrt(t.x);
    // normalize: 0.75^2 * 2.0  == 1.125
    return  t * vec3(1.0, -2.0, -2.0) * (1.0 / 1.125);
}

// Classic 3x3 Cellular noise with F1 and F2 distances and derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 cellularNoised(vec2 pos, vec2 scale, float jitter, float phase, float seed) 
{       
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);
    dx0 = 0.5 * sin(phase + kPI2 * dx0) + 0.5;
    dy0 = 0.5 * sin(phase + kPI2 * dy0) + 0.5;
    dx1 = 0.5 * sin(phase + kPI2 * dx1) + 0.5;
    dy1 = 0.5 * sin(phase + kPI2 * dy1) + 0.5;
    
    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = dx0 * dx0 + dy0 * dy0; 
    vec4 d1 = dx1 * dx1 + dy1 * dy1; 
    
    vec2 centerPos = (0.5 * sin(phase + kPI2 * multiHash2D(i)) + 0.5) * jitter - f; // 0 0
    float dCenter = dot(centerPos, centerPos);
    vec4 d = min(d0, d1);
    vec4 less = step(d1, d0);
    vec4 dx = mix(dx0, dx1, less);
    vec4 dy = mix(dy0, dy1, less);

    vec3 t1 = d.x < d.y ? vec3(d.x, dx.x, dy.x) : vec3(d.y, dx.y, dy.y);
    vec3 t2 = d.z < d.w ? vec3(d.z, dx.z, dy.z) : vec3(d.w, dx.w, dy.w);
    t2 = t2.x < dCenter ? t2 : vec3(dCenter, centerPos);
    vec3 t = t1.x < t2.x ? t1 : t2;
    t.x = sqrt(t.x);
    // normalize: 0.75^2 * 2.0  == 1.125
    return  t * vec3(1.0, -2.0, -2.0) * (1.0 / 1.125);
}

// A variation of 3x3 Cellular noise that multiplies the minimum distance between the cells.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the metaballs distance from the cell edges, range: [0, 1]
float metaballs(vec2 pos, vec2 scale, float jitter, float seed) 
{       
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);

    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = dx0 * dx0 + dy0 * dy0; 
    vec4 d1 = dx1 * dx1 + dy1 * dy1; 
    
    vec2 centerPos = multiHash2D(i) * jitter - f; // 0 0
    
    float d = min(1.0, dot(centerPos, centerPos));
    d = min(d, d * d0.x);
    d = min(d, d * d0.y);
    d = min(d, d * d0.z);
    d = min(d, d * d0.w);
    d = min(d, d * d1.x);
    d = min(d, d * d1.y);
    d = min(d, d * d1.z);
    d = min(d, d * d1.w);
    
    return sqrt(d);
}

float metaballs(vec2 pos, vec2 scale, float jitter, float width, float smoothness, float seed) 
{       
    float d = metaballs(pos, scale, jitter, seed);
    return smoothstep(width, width + smoothness, d);
}

// A variation of 3x3 Cellular noise that multiplies the minimum distance between the cells.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the metaballs distance from the cell edges, range: [0, 1]
float metaballs(vec2 pos, vec2 scale, float jitter, float phase, float seed) 
{       
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);
    dx0 = 0.5 * sin(phase + kPI2 * dx0) + 0.5;
    dy0 = 0.5 * sin(phase + kPI2 * dy0) + 0.5;
    dx1 = 0.5 * sin(phase + kPI2 * dx1) + 0.5;
    dy1 = 0.5 * sin(phase + kPI2 * dy1) + 0.5;
    
    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = dx0 * dx0 + dy0 * dy0; 
    vec4 d1 = dx1 * dx1 + dy1 * dy1; 
    
    vec2 centerPos = (0.5 * sin(phase + kPI2 * multiHash2D(i)) + 0.5) * jitter - f; // 0 0
    
    float d = min(1.0, dot(centerPos, centerPos));
    d = min(d, d * d0.x);
    d = min(d, d * d0.y);
    d = min(d, d * d0.z);
    d = min(d, d * d0.w);
    d = min(d, d * d1.x);
    d = min(d, d * d1.y);
    d = min(d, d * d1.z);
    d = min(d, d * d1.w);
    
    return sqrt(d);
}

float metaballs(vec2 pos, vec2 scale, float jitter, float phase, float width, float smoothness, float seed) 
{       
    float d = metaballs(pos, scale, jitter, phase, seed);
    return smoothstep(width, width + smoothness, d);
}

// A variation of 3x3 Cellular noise that multiplies the minimum distance between the cells.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param metric The distance metric used, can be euclidean, manhattan, chebyshev or triangular, range: [0, 3], default: 0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the metaballs distance from the cell edges, range: [0, 1]
float metaballs(vec2 pos, vec2 scale, float jitter, float phase, uint metric, float seed) 
{       
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;
    
    const vec3 offset = vec3(-1.0, 0.0, 1.0);
    vec4 cells = mod(i.xyxy + offset.xxzz, scale.xyxy) + seed;
    i = mod(i, scale) + seed;
    vec4 dx0, dy0, dx1, dy1;
    multiHash2D(vec4(cells.xy, vec2(i.x, cells.y)), vec4(cells.zyx, i.y), dx0, dy0);
    multiHash2D(vec4(cells.zwz, i.y), vec4(cells.xw, vec2(i.x, cells.w)), dx1, dy1);
    dx0 = 0.5 * sin(phase + kPI2 * dx0) + 0.5;
    dy0 = 0.5 * sin(phase + kPI2 * dy0) + 0.5;
    dx1 = 0.5 * sin(phase + kPI2 * dx1) + 0.5;
    dy1 = 0.5 * sin(phase + kPI2 * dy1) + 0.5;
    
    dx0 = offset.xyzx + dx0 * jitter - f.xxxx; // -1 0 1 -1
    dy0 = offset.xxxy + dy0 * jitter - f.yyyy; // -1 -1 -1 0
    dx1 = offset.zzxy + dx1 * jitter - f.xxxx; // 1 1 -1 0
    dy1 = offset.zyzz + dy1 * jitter - f.yyyy; // 1 0 1 1
    vec4 d0 = distanceMetric(dx0, dy0, metric);
    vec4 d1 = distanceMetric(dx1, dy1, metric);
    
    vec2 centerPos = (0.5 * sin(phase + kPI2 * multiHash2D(i)) + 0.5) * jitter - f; // 0 0
    
    float d = min(1.0, distanceMetric(centerPos, metric));
    d = min(d, d * d0.x);
    d = min(d, d * d0.y);
    d = min(d, d * d0.z);
    d = min(d, d * d0.w);
    d = min(d, d * d1.x);
    d = min(d, d * d1.y);
    d = min(d, d * d1.z);
    d = min(d, d * d1.w);
    
    return metric == 0u ? sqrt(d) : d;
}

float metaballs(vec2 pos, vec2 scale, float jitter, float phase, float width, float smoothness, uint metric, float seed) 
{       
    float d = metaballs(pos, scale, jitter, phase, metric, seed);
    return smoothstep(width, width + smoothness, d);
}

// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param metric The distance metric used, can be euclidean, manhattan, chebyshev or triangular, range: [0, 3], default: 0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise
vec3 crystals(vec2 pos, vec2 scale, float jitter, float phase, uint metric)
{
    vec3 c0 = vec3(cellularNoise(pos, scale, jitter, phase, metric, 0.0), 0.0); // ShaderMaker：原文 vec2 直接赋给 vec3，补齐分量
    vec3 c1 = vec3(cellularNoise(pos, scale, jitter, phase, metric, 23.0), 0.0);
    c0.x = 1.0 - c0.x;
    c1.x = 1.0 - c1.x;
    if (c0.x > c1.x)
    {
        vec3 temp = c0;
        c0 = c1;
        c1 = temp;
    }

    return vec3(c1.x - c0.x, c0.yz - c1.yz);
}

// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise, yz = derivative of the noise, range: [-1, 1]
vec3 crystalsd(vec2 pos, vec2 scale, float jitter, float phase)
{
    vec3 c0 = cellularNoised(pos, scale, jitter, phase, 0.0);
    vec3 c1 = cellularNoised(pos, scale, jitter, phase, 23.0);
    c0.x = 1.0 - c0.x;
    c1.x = 1.0 - c1.x;
    if (c0.x > c1.x)
    {
        vec3 temp = c0;
        c0 = c1;
        c1 = temp;
    }

    return vec3(c1.x - c0.x, c0.yz - c1.yz);
}

// ---- voronoi.glsl ----
// Voronoi with the distance from edges.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the voronoi cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the distance from the cell edges, yz = tile position of the cell, range: [0, 1]
vec3 voronoi(vec2 pos, vec2 scale, float jitter, float phase, float seed)
{
     // voronoi based on Inigo Quilez: https://archive.is/Ta7dm
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;

    // first pass
    vec2 minPos, tilePos;
    float minDistance = 1e+5;
    for (int k=0; k<8; k+=2)
    {
        ivec2 k1 = ivec2(k, k + 1);
        ivec2 ky = k1 / 3;
        vec4 n = vec4(k1 - ky * 3, ky).xzyw - 1.0;
        
        vec4 ni = mod(i.xyxy + n, scale.xyxy) + seed;
        vec4 cPos = multiHash2D(ni.xy, ni.zw) * jitter;
        cPos = 0.5 * sin(phase + kPI2 * cPos) + 0.5;
        vec4 rPos = n + cPos - f.xyxy;

        vec4 temp = rPos * rPos;
        temp.xy = temp.xz + temp.yw;
        vec4 minResult = temp.x < temp.y ? vec4(rPos.xy, cPos.xy) : vec4(rPos.zw, cPos.zw);
        float d = min(temp.x, temp.y);
        if(d < minDistance)
        {
            minDistance = d;
            minPos = minResult.xy;
            tilePos = minResult.zw;
        }
    }
    // last cell
    {
        vec2 n = vec2(1.0);
        vec2 ni = mod(i.xy + n, scale) + seed;
        vec2 cPos = multiHash2D(ni) * jitter;
        cPos = 0.5 * sin(phase + kPI2 * cPos) + 0.5;
        vec2 rPos = n + cPos - f;

        float d = dot(rPos, rPos);
        if(d < minDistance)
        {
            minDistance = d;
            minPos = rPos;
            tilePos = cPos;
        }
    }

    // second pass, distance to edges
    minDistance = 1e+5;
    for (int y=-2; y<=2; y++)
    {
        for (int x=-2; x<=2; x+=2)
        { 
            vec4 n = vec4(x, y, x + 1, y);
            vec4 ni = mod(i.xyxy + n, scale.xyxy) + seed;
            vec4 cPos = multiHash2D(ni.xy, ni.zw) * jitter;
            cPos = 0.5 * sin(phase + kPI2 * cPos) + 0.5;
            vec4 rPos = n + cPos - f.xyxy;
            
            // compute the perpendicular distance
            vec4 temp = minPos.xyxy - rPos;
            temp *= temp;
            vec2 l  = temp.xz + temp.yw;
            vec4 a = 0.5 * (minPos.xyxy + rPos);
            vec4 b = rPos - minPos.xyxy;
            temp = b * b;
            b /= sqrt(temp.xz + temp.yw).xxyy;
            
            temp = a * b;
            vec2 d = temp.xz + temp.yw; 
            if(l.x > 1e-5) 
                minDistance = min(minDistance, d.x);
            if(l.y > 1e-5) 
                minDistance = min(minDistance, d.y);
                
        }      
    }

    return vec3(minDistance, tilePos);
}

// Voronoi with the position and minimum distance.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the voronoi cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param phase The phase for rotating the cells, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the distance from the cell edges, yz = tile position of the cell, range: [0, 1]
vec3 voronoiPosition(vec2 pos, vec2 scale, float jitter, float phase, float seed)
{
    const float kPI2 = 6.2831853071;
    pos *= scale;
    vec2 i = floor(pos);
    vec2 f = pos - i;

    // first pass
    vec2 tilePos;
    float minDistance = 1e+5;
    for (int k=0; k<8; k+=2)
    {
        ivec2 k1 = ivec2(k, k + 1);
        ivec2 ky = k1 / 3;
        vec4 n = vec4(k1 - ky * 3, ky).xzyw - 1.0;
        
        vec4 ni = mod(i.xyxy + n, scale.xyxy) + seed;
        vec4 cPos = multiHash2D(ni.xy, ni.zw) * jitter;
        cPos = 0.5 * sin(phase + kPI2 * cPos) + 0.5;
        vec4 rPos = n + cPos - f.xyxy;

        vec4 temp = rPos * rPos;
        temp.xy = temp.xz + temp.yw;

        vec3 minResult = temp.x < temp.y ? vec3(cPos.xy, temp.x) : vec3(cPos.zw, temp.y);
        float d = minResult.z;
        if(d < minDistance)
        {
            minDistance = d;
            tilePos = minResult.xy;
        }
    }
    // last cell
    {
        vec2 n = vec2(1.0);
        vec2 ni = mod(i.xy + n, scale) + seed;
        vec2 cPos = multiHash2D(ni) * jitter;
        cPos = 0.5 * sin(phase + kPI2 * cPos) + 0.5;
        vec2 rPos = n + cPos - f;

        float d = dot(rPos, rPos);
        if(d < minDistance)
        {
            minDistance = d;
            tilePos = cPos;
        }
    }
    return vec3(tilePos, minDistance);
}

// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the voronoi cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param variance The color variance, if zero then it will result in grayscale pattern, range: [0, 1], default: 1.0
// @param factor The position factor multiplier, range: [0, 10], default: 1.0
// @param seed Random seed for the color pattern, range: [0, inf], default: 0.0
// @return Returns the color of the pattern cells., range: [0, 1]
vec3 voronoiPattern(vec2 pos, vec2 scale, float jitter, float variance, float factor, float seed)
{
    vec2 tilePos = voronoiPosition(pos, scale, jitter, 0.0, 0.0).xy;
    float rand = abs(hash1D(tilePos * factor + seed));
    return (rand < variance ? hash3D(tilePos + seed) : vec3(rand));
}

// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the voronoi cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param width Width of the lines, range: [0, 1], default: 0.1
// @param smoothness Controls how soft the lines are, range: [0, 1], default: 0.0
// @param warp The warp strength, range: [0, 1], default: 0.0
// @param warpScale The scale of warp, range: [0, 1], default: 2.0
// @param warpSmudge If true creates a smudge effect on the lines, range: [false, true], default: false
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the cell position and the value of the pattern, range: [0, 1]
vec3 cracks(vec2 pos, vec2 scale, float jitter, float width, float smoothness, float warp, float warpScale, bool warpSmudge, float smudgePhase, float seed)
{
    vec3 g = gradientNoised(pos, scale * warpScale, smudgePhase, seed);
    pos += (warpSmudge ? g.yz : g.xx) * 0.1 * warp;
    vec3 v = voronoi(pos, scale, jitter, 0.0, seed);
    return vec3(smoothstep(max(width - smoothness, 0.0), width + fwidth(v.x), v.x), v.yz);
}

// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param jitter Jitter factor for the voronoi cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param width Width of the lines, range: [0, 1], default: 0.1
// @param smoothness Controls how soft the lines are, range: [0, 1], default: 0.0
// @param warp The warp strength, range: [0, 1], default: 0.0
// @param warpScale The scale of warp, range: [0, 1], default: 2.0
// @param warpSmudge If true creates a smudge effect on the lines, range: [false, true], default: false
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return Returns the value of the pattern, range: [0, 1]
float cracks(vec2 pos, vec2 scale, float jitter, float width, float smoothness, float warp, float warpScale, bool warpSmudge, float seed)
{   
    return cracks(pos, scale, jitter, width, smoothness, warp, warpScale, warpSmudge, 0.0, seed).x;
}

// ---- fbm.glsl ----
// Classic FBM implementation using Value noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shift Position shift for each octave, range: [0, inf]
// @param timeShift Time shift for each octave, range: [-inf, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param octaveFactor The octave intensity factor, the lower the more pronounced the lower octaves will be, range: [-1, 1], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise, range: [0, inf]
float fbm(vec2 pos, vec2 scale, int octaves, float shift, float timeShift, float gain, float lacunarity, float octaveFactor, float seed) 
{
    float amplitude = gain;
    float time = timeShift;
    vec2 frequency = scale;
    vec2 offset = vec2(shift, 0.0);
    vec2 p = pos * frequency;
    octaveFactor = 1.0 + octaveFactor * 0.12;
    
    vec2 sinCos = vec2(sin(shift), cos(shift));
    mat2 rotate = mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y);

    float value = 0.0;
    for (int i = 0; i < octaves; i++) 
    {
        float n = noise(p / frequency, frequency, time, seed);
        value += amplitude * n;
        
        p = p * lacunarity + offset * float(1 + i);
        frequency *= lacunarity;
        amplitude = pow(amplitude * gain, octaveFactor);
        time += timeShift;
        offset *= rotate;
    }
    return value * 0.5 + 0.5;
}

// FBM implementation using Value noise with derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shift Position shift for each octave, range: [0, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32], default: 2.0
// @param slopeness Slope intensity of the derivatives, range: [0, 1], default: 0.5
// @param octaveFactor The octave intensity factor, the lower the more pronounced the lower octaves will be, range: [-1, 1], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, range: [0, inf], yz = derivative of the noise, range: [-1, 1]
vec3 fbmd(vec2 pos, vec2 scale, int octaves, vec2 shift, float timeShift, float gain, vec2 lacunarity, float slopeness, float octaveFactor, float seed) 
{
    // fbm implementation based on Inigo Quilez
    float amplitude = gain;
    float time = timeShift;
    vec2 frequency = scale;
    vec2 p = pos * frequency;
    octaveFactor = 1.0 + octaveFactor * 0.12;
    
    vec2 sinCos = vec2(sin(shift.x), cos(shift.y));
    mat2 rotate = mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y);

    vec3 value = vec3(0.0);
    vec2 derivative = vec2(0.0);
    for (int i = 0; i < octaves; i++) 
    {
        vec3 n =  noised(p / frequency, frequency, time, seed).xyz;
        derivative += n.yz;

        n *= amplitude;
        n.x /= (1.0 + mix(0.0, dot(derivative, derivative), slopeness));
        value += n; 
        
        p = (p + shift) * lacunarity;
        frequency *= lacunarity;
        amplitude = pow(amplitude * gain, octaveFactor);
        shift = shift * rotate;
        time += timeShift;
    }
    
    value.x = value.x * 0.5 + 0.5;
    return value;
}
vec3 fbmd(vec2 pos, vec2 scale, int octaves, float shift, float timeShift, float gain, float lacunarity, float slopeness, float octaveFactor, float seed) 
{
    return fbmd(pos, scale, octaves, vec2(shift), timeShift, gain, vec2(lacunarity), slopeness, octaveFactor, seed);
}
vec3 fbmd(vec2 pos, vec2 scale, int octaves, vec2 shift, float timeShift, float gain, float lacunarity, float slopeness, float octaveFactor, float seed) 
{
    return fbmd(pos, scale, octaves, shift, timeShift, gain, vec2(lacunarity), slopeness, octaveFactor, seed);
}

// FBM implementation using Perlin noise with derivatives.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shift Position shift for each octave, range: [0, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32], default: 2.0
// @param slopeness Slope intensity of the derivatives, range: [0, 1], default: 0.25
// @param octaveFactor The octave intensity factor, the lower the more pronounced the lower octaves will be, range: [-1, 1], default: 0.0
// @param negative If true use a negative range for the noise values, will result in more contrast, range: [false, true]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return x = value of the noise, range: [-1, inf], yz = derivative of the noise, range: [-1, 1]
vec3 fbmdPerlin(vec2 pos, vec2 scale, int octaves, vec2 shift, mat2 transform, float gain, vec2 lacunarity, float slopeness, float octaveFactor, bool negative, float seed) 
{
    // fbm implementation based on Inigo Quilez
    float amplitude = gain;
    vec2 frequency = floor(scale);
    vec2 p = pos * frequency;
    octaveFactor = 1.0 + octaveFactor * 0.3;

    vec3 value = vec3(0.0);
    vec2 derivative = vec2(0.0);
    for (int i = 0; i < octaves; i++) 
    {
        vec3 n = perlinNoised(p / frequency, frequency, transform, seed);
        derivative += n.yz;
        n.x = negative ? n.x : n.x * 0.5 + 0.5;
        n *= amplitude;
        value.x += n.x / (1.0 + mix(0.0, dot(derivative, derivative), slopeness));
        value.yz += n.yz; 
        
        p = (p + shift) * lacunarity;
        frequency *= lacunarity;
        amplitude = pow(amplitude * gain, octaveFactor);
        transform *= transform;
    }

    return value;
}
vec3 fbmdPerlin(vec2 pos, vec2 scale, int octaves, vec2 shift, float axialShift, float gain, vec2 lacunarity, float slopeness, float octaveFactor, bool negative, float seed) 
{
    vec2 cosSin = vec2(cos(axialShift), sin(axialShift));
    mat2 transform = mat2(cosSin.x, cosSin.y, -cosSin.y, cosSin.x) * mat2(0.8, -0.6, 0.6, 0.8);
    return fbmdPerlin(pos, scale, octaves, shift, transform, gain, lacunarity, slopeness, octaveFactor, negative, seed);
}

// FBM implementation using Perlin noise, can also be used to create ridges based on the mode used.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shift Position shift for each octave, range: [0, inf]
// @param axialShift Axial or rotational shift for each octave, range: [-inf, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param mode Mode used in combining the noise for the ocatves, range: [0, 5]
// @param factor Pow intensity factor, range: [0, 10], default: 1.0
// @param offset Offsets the value of the noise, range: [-1, 1], default: 0.0
// @param octaveFactor The octave intensity factor, the lower the more pronounced the lower octaves will be, range: [-1, 1], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise, range: [0, inf]
float fbmPerlin(vec2 pos, vec2 scale, int octaves, float shift, float axialShift, float gain, float lacunarity, uint mode, float factor, float offset, float octaveFactor, float seed) 
{
    float amplitude = gain;
    vec2 frequency = floor(scale);
    float angle = axialShift;
    float n = 1.0;
    vec2 p = fract(pos) * frequency;

    float value = 0.0;
    for (int i = 0; i < octaves; i++) 
    {
        float pn = perlinNoise(p / frequency, frequency, angle, seed) + offset;
        if (mode == 0u)
        {
            n *= abs(pn);
        }
        else if (mode == 1u)
        {
            n = abs(pn);
        }
        else if (mode == 2u)
        {
            n = pn;
        }
        else if (mode == 3u)
        {
            n *= pn;
        }
        else if (mode == 4u)
        {
            n = pn * 0.5 + 0.5;
        }
        else
        {
            n *= pn * 0.5 + 0.5;
        }
        
        n = pow(n < 0.0 ? 0.0 : n, factor);
        value += amplitude * n;
        
        p = p * lacunarity + shift;
        frequency *= lacunarity;
        amplitude = pow(amplitude * gain, octaveFactor);
        angle += axialShift;
    }
    return value;
}

// FBM implementation using Voronoi.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shift Position shift for each octave, range: [0, inf]
// @param timeShift Time shift for each octave, range: [-inf, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param octaveFactor The octave intensity factor, the lower the more pronounced the lower octaves will be, range: [-1, 1], default: 0.0
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param interpolate Interpolate factor between the multiplication mode and normal mode, default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise, range: [0, inf]
vec4 fbmVoronoi(vec2 pos, vec2 scale, int octaves, float shift, float timeShift, float gain, float lacunarity, float octaveFactor, float jitter, float interpolate, float seed) 
{
    float amplitude = gain;
    float time = timeShift;
    vec2 frequency = scale;
    vec2 offset = vec2(shift, 0.0);
    vec2 p = pos * frequency;
    octaveFactor = 1.0 + octaveFactor * 0.12;
    
    vec2 sinCos = vec2(sin(shift), cos(shift));
    mat2 rotate = mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y);
    
    float n = 1.0;
    vec4 value = vec4(0.0);
    for (int i = 0; i < octaves; i++) 
    {
        vec3 v = voronoi(p / frequency, frequency, jitter, timeShift, seed);
        v.x = v.x * 2.0 - 1.0;
        n *= v.x;
        value += amplitude * vec4(mix(v.x, n, interpolate), hash3D(v.yz));
        
        p = p * lacunarity + offset * float(1 + i);
        frequency *= lacunarity;
        amplitude = pow(amplitude * gain, octaveFactor);
        time += timeShift;
        offset *= rotate;
    }
    value.x = value.x * 0.5 + 0.5;
    return value;
}

// FBM implementation using a variation of Value noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shift Position shift for each octave, range: [0, inf], default: 100.0
// @param timeShift Time shift for each octave, range: [-inf, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param translate Translate factors for the value noise , range: [-inf, inf], default: {0.5, -0.25, 0.15}
// @param warpStrength The warp factor used for domain warping, range: [-10, 10], default: 0.5
// @param octaveFactor The octave intensity factor, the lower the more pronounced the lower octaves will be, range: [-1, 1], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise, range: [0, inf]
float fbmGrid(vec2 pos, vec2 scale, int octaves, float shift, float timeShift, float gain, float lacunarity, vec3 translate, float warpStrength, float octaveFactor, float seed) 
{
    float amplitude = gain;
    float time = timeShift;
    vec2 frequency = scale;
    vec2 offset = vec2(shift, 0.0);
    vec2 p = pos * frequency;
    octaveFactor = 1.0 + octaveFactor * 0.12;
    
    vec2 sinCos = vec2(sin(shift), cos(shift));
    mat2 rotate = mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y);

    float value = 0.0;
    for (int i = 0; i < octaves; i++) 
    {
        vec2 pi = p / frequency + value * warpStrength;
        vec4 mn;
        mn.xy = multiNoise(pi.xyxy + vec2(0.0, translate.x).xxyy, frequency.xyxy, time, seed);
        mn.zw = multiNoise(pi.xyxy + translate.yyzz, frequency.xyxy, time, seed);
        mn.xy = mn.xy * mn.zw;

        float n = pow(abs(mn.x * mn.y), 0.25) * 2.0 - 1.0;
        value += amplitude * n;
        
        p = p * lacunarity + offset * float(1 + i);
        frequency *= lacunarity;
        amplitude = pow(amplitude * gain, octaveFactor);
        time += timeShift;
        offset *= rotate;
    }
    value = value * 0.5 + 0.5;
    return value * value;
}

float fbmGrid(vec2 pos, vec2 scale, int octaves, float shift, float timeShift, float gain, float lacunarity, float warpStrength, float octaveFactor, float seed) 
{
    vec3 translate = (hash3D(vec2(seed)) * 2.0 - 1.0) * scale.xyx;
    return fbmGrid(pos, scale, octaves, shift, timeShift, gain, lacunarity, translate, warpStrength, octaveFactor, seed);
}

// FBM implementation using metaballs.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shift Position shift for each octave, range: [0, inf]
// @param timeShift Time shift for each octave, range: [-inf, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param octaveFactor The octave intensity factor, the lower the more pronounced the lower octaves will be, range: [-1, 1], default: 0.0
// @param interpolate Interpolate factor between the multiplication mode and normal mode, default: 0.0
// @param jitter Jitter factor for the cells, if zero then it will result in a square grid, range: [0, 1], default: 1.0
// @param width Width and softness of the metaballs, range: [0, 1], default: {0.1, 0.01}
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise, range: [0, inf]
float fbmMetaballs(vec2 pos, vec2 scale, int octaves, float shift, float timeShift, float gain, float lacunarity, float octaveFactor, float jitter, float interpolate, vec2 width, float seed) 
{
    float amplitude = gain;
    float time = timeShift;
    vec2 frequency = scale;
    vec2 offset = vec2(shift, 0.0);
    vec2 p = pos * frequency;
    octaveFactor = 1.0 + octaveFactor * 0.12;
    
    vec2 sinCos = vec2(sin(shift), cos(shift));
    mat2 rotate = mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y);
    
    float n = 1.0;
    float value = 0.0;
    for (int i = 0; i < octaves; i++) 
    {
        float cn = metaballs(p / frequency, frequency, jitter, timeShift, width.x, width.y, seed) * 2.0 - 1.0;
        n *= cn;
        value += amplitude * mix(n, abs(n), interpolate);
        
        p = p * lacunarity + offset * float(1 + i);
        frequency *= lacunarity;
        amplitude = pow(amplitude * gain, octaveFactor);
        time += timeShift;
        offset *= rotate;
    }
    return value * 0.5 + 0.5;
}

// FBM implementation using value noise which returns multiple values.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param phase The phase for rotating the hash, range: [0, inf], default: 0.0
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
// @return value of the noise, range: [0, inf]
vec4 fbmMulti(vec2 pos, vec2 scale, float lacunarity, int octaves, float phase, float seed) 
{    
    vec4 seeds = vec4(0.0, 1031.0, 537.0, 23.0) + seed;
    float f = 2.0 / lacunarity;
    
    vec4 value = vec4(0.0);
    float w = 1.0;
    float acc = 0.0;
    for (int i = 0; i < octaves; i++) 
    {
        vec2 ns = vec2(scale / w);
        vec4 n;
        n.xy = multiNoise(pos.xyxy, ns.xyxy, phase, seeds.xy);
        n.zw = multiNoise(pos.xyxy, ns.xyxy, phase, seeds.zw);
        value += (n * 0.5 + 0.5) * w;
        acc += w;
        w *= 0.5 * f;
    }
    return value / acc;
}

// ---- ShaderMaker 补充：warp.glsl 的 curlWarp 调用了库里不存在的两参数 perlinNoise，补一个默认 seed = 0 的重载 ----
float perlinNoise(vec2 pos, vec2 scale) { return perlinNoise(pos, scale, 0.0); }

// ---- warp.glsl ----
// Domain warping using a factal sum of value noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param factors Controls the warp Q and R factors, range: [-1, 1], default: vec2(1.0, 1.0)
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shifts Shift or seed values for the Q and R domain warp factors, range: [0, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param slopeness Slope intensity of the derivatives, range: [0, 1], default: 0.5
// @param phase Phase to rotated the noise gradients, range: [0, PI]
// @param negative If true use a negative range for the noise values, range: [false, true]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
float fbmWarp(vec2 pos, vec2 scale, vec2 factors, int octaves, vec4 shifts, float timeShift, float gain, vec2 lacunarity, float slopeness, float octaveFactor, bool negative, float seed,
              out vec2 q, out vec2 r) 
{
    float qfactor = factors.x;
    float rfactor = factors.y;
    q.x = fbmd(pos, scale, octaves, vec2(0.0), timeShift, gain, lacunarity, slopeness, octaveFactor, seed).x;
    q.y = fbmd(pos, scale, octaves, vec2(shifts.x), timeShift, gain, lacunarity, slopeness, octaveFactor, seed).x;
    q = negative ? q * 2.0 - 1.0 : q;
    
    vec2 np = pos + qfactor * q;
    r.x = fbmd(np, scale, octaves, vec2(shifts.y), timeShift, gain, lacunarity, slopeness, octaveFactor, seed).x;
    r.y = fbmd(np, scale, octaves, vec2(shifts.z), timeShift, gain, lacunarity, slopeness, octaveFactor, seed).x;
    r = negative ? r * 2.0 - 1.0 : r;

    return fbmd(pos + r * rfactor, scale, octaves, vec2(shifts.w), timeShift, gain, lacunarity, slopeness, octaveFactor, seed).x;
}

// Domain warping using a factal sum of perlin noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param factors Controls the warp Q and R factors, range: [-1, 1], default: vec2(0.2, 0.2)
// @param octaves Number of octaves for the fbm, range: [1, inf]
// @param shifts Shift or seed values for the Q and R domain warp factors, range: [0, inf]
// @param gain Gain for each fbm octave, range: [0, 2], default: 0.5
// @param lacunarity Frequency of the fbm, must be integer for tileable results, range: [1, 32]
// @param slopeness Slope intensity of the derivatives, range: [0, 1], default: 0.5
// @param phase Phase to rotated the noise gradients, range: [0, PI]
// @param negative If true use a negative range for the noise values, range: [false, true]
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
float fbmPerlinWarp(vec2 pos, vec2 scale, vec2 factors, int octaves, vec4 shifts, float timeShift, float gain, vec2 lacunarity, float slopeness, float octaveFactor, bool negative, float seed,
                      out vec2 q, out vec2 r) 
{
    float qfactor = factors.x;
    float rfactor = factors.y;
    q.x = fbmdPerlin(pos, scale, octaves, vec2(0.0), timeShift, gain, lacunarity, slopeness, octaveFactor, negative, seed).x;
    q.y = fbmdPerlin(pos, scale, octaves, vec2(shifts.x), timeShift, gain, lacunarity, slopeness, octaveFactor, negative, seed).x;
    
    vec2 np = pos + qfactor * q;
    r.x = fbmdPerlin(np, scale, octaves, vec2(shifts.y), timeShift, gain, lacunarity, slopeness, octaveFactor, negative, seed).x;
    r.y = fbmdPerlin(np, scale, octaves, vec2(shifts.z), timeShift, gain, lacunarity, slopeness, octaveFactor, negative, seed).x;
    
    return fbmdPerlin(pos + r * rfactor, scale, octaves, vec2(shifts.w), timeShift, gain, lacunarity, slopeness, octaveFactor, negative, seed).x;
}

// Domain warping using the derivatives of gradient noise.
// @param factors Controls the warp Q and R factors, range: [-1, 1], default: vec2(1.0, 1.0)
// @param seeds Seeds for the Q and R domain warp factors, range: [-inf, inf]
// @param curl Curl or bend of the noise, range: [0, 1], default: 0.5
// @param seed Seed to randomize result, range: [0, inf], default: 0.0
float curlWarp(vec2 pos, vec2 scale, vec2 factors, vec4 seeds, float curl, float seed,
               out vec2 q, out vec2 r)
{
    float qfactor = factors.x;
    float rfactor = factors.y;
    vec2 curlFactor = vec2(1.0, -1.0) * vec2(curl, 1.0 - curl);
    
    vec2 n = gradientNoised(pos, scale, seed).zy * curlFactor;
    q.x = n.x + n.y;
    n = gradientNoised(pos + hash2D(seeds.x), scale, seed).zy * curlFactor;
    q.x = n.x + n.y;
    
    vec2 np = pos + qfactor * q;
    n = gradientNoised(np + hash2D(seeds.y), scale, seed).zy * curlFactor;
    r.x = n.x + n.y;
    n = gradientNoised(np + hash2D(seeds.z), scale, seed).zy * curlFactor;
    r.y = n.x + n.y;

    return perlinNoise(pos + r * rfactor + hash2D(seeds.w), scale);
}

// Domain warping using the derivatives of perlin noise.
// @param scale Number of tiles, must be  integer for tileable results, range: [2, inf]
// @param strength Controls the warp strength, range: [-1, 1]
// @param phase Noise phase, range: [-inf, inf]
// @param spread The gradient spread, range: [0.001, inf], default: 0.001
// @param factor Pow intensity factor, range: [0, 10]
float perlinNoiseWarp(vec2 pos, vec2 scale, float strength, float phase, float factor, float spread, float seed)
{
    vec2 offset = vec2(spread, 0.0);
    strength *= 32.0 / max(scale.x, scale.y);
    
    vec4 gp;
    gp.x = perlinNoise(pos - offset.xy, scale, phase, seed);
    gp.y = perlinNoise(pos + offset.xy, scale, phase, seed);
    gp.z = perlinNoise(pos - offset.yx, scale, phase, seed);
    gp.w = perlinNoise(pos + offset.yx, scale, phase, seed);
    gp = pow(gp, vec4(factor));
    vec2 warp = vec2(gp.y - gp.x, gp.w - gp.z);
    return pow(perlinNoise(pos + warp * strength, scale, phase, seed), factor);
}

// ---- hexagons.glsl ----
float sdfHexagon(vec2 pos, float radius, bool isVertical)
{
    // 60 degrees, tan of 30 degrees and one over angle
    const vec3 kAngles = vec3(1.047198, 0.954929249292, 0.523599);
    // rotate 90 degrees
    pos = isVertical ? pos: -pos.yx;
    
    vec2 temp = vec2(radius, atan(pos.y, pos.x)) * kAngles.zy + vec2(0.0, 0.5);
    float angle = kAngles.x * floor(temp.y);
    vec2 rotation = vec2(sin(angle), cos(angle));
    pos = pos.x * rotation.yx * vec2(1.0, -1.0) + pos.y * rotation;

    float he = temp.x; 
    vec2 offset = vec2(radius, clamp(pos.y, -he, he));
    return length(pos - offset) * sign(pos.x - radius);
}

// Computes the radii of the hexagons.
// @param scale Number of tiles, must be an integer for tileable results, range: [1, inf]
// @param isVertical Changes the orientation of the hexagons.
// @return xy = horizontal or vertical radius, zw = diagonal radius, range: [0, 1]
vec4 tileHexagonsRadii(vec2 scale, bool isVertical)
{
    vec2 tileSize = 0.3333333 / scale;
    // the horizontal and diagonal radii
    vec4 radii = isVertical ? tileSize.yyyx : tileSize.xxxy;
    return radii * vec4(1.0, 0.0, 0.5, 1.5);
}

// 2D Hexagonal grid tiling.
// @param scale Number of tiles, must be an integer for tileable results, range: [1, inf]
// @param isVertical Changes the orientation of the hexagons.
// @return xy = normalized UV, zw = center position in UV space, range: [0, 1]
vec4 tileHexagons(vec2 pos, vec2 scale, bool isVertical)
{
    const float kSqrtThree = 1.73205080757;
    const float kHalfSqrtThree = 0.866025403785;
    const float kInvSqrtThree = 0.57735026919;
    vec4 hexScale = vec4(1.0, kSqrtThree, 1.0, kInvSqrtThree);
    hexScale = isVertical ? hexScale : hexScale.yxwz;
    vec4 r = vec4(1.0, kHalfSqrtThree, 0.5, kInvSqrtThree);
    r = isVertical ? r : r.yxwz;
    
    pos *= scale * hexScale.xy;
    vec4 center = floor(pos.xyxy * hexScale.zwzw + vec4(0.0, 0.0, -r.zw)) + 0.5;
    vec4 uv = pos.xyxy - center * hexScale.xyxy + vec4(0.0, 0.0, -0.5 * hexScale.xy);
    // dot product
    vec4 temp = uv * uv;
    temp.xy = temp.xz + temp.yw;
    vec4 uvCenter = temp.x < temp.y ? vec4(uv.xy, center.xy) : vec4(uv.zw, center.zw + 0.5);
    // normalize UV range and transform center position to UV space
    return uvCenter * vec4(r.xy, 1.0 / scale) + vec4(0.5, 0.5, 0.0, 0.0);
}

// 2D Hexagonal grid tiling.
// @param scale Number of tiles, must be an integer for tileable results, range: [1, inf]
// @param isVertical Changes the orientation of the hexagons.
// @return xy = normalized UV, zw = center position in UV space, range: [0, 1], edgeDistance = distonce from the edge
vec4 tileHexagons(vec2 pos, vec2 scale, bool isVertical, out float edgeDistance)
{
    const float kSqrtThree = 1.73205080757;
    const float kHalfSqrtThree = 0.866025403785;
    const float kInvSqrtThree = 0.57735026919;
    vec4 hexScale = vec4(1.0, kSqrtThree, 1.0, kInvSqrtThree);
    hexScale = isVertical ? hexScale : hexScale.yxwz;
    vec4 r = vec4(1.0, kHalfSqrtThree, 0.5, kInvSqrtThree);
    r = isVertical ? r : r.yxwz;
    
    vec2 invScale = 1.0 / scale;
    vec2 p = pos * scale * hexScale.xy;
    vec4 center = floor(p.xyxy * hexScale.zwzw + vec4(0.0, 0.0, -r.zw)) + 0.5;
    vec4 uv = p.xyxy - center * hexScale.xyxy + vec4(0.0, 0.0, -0.5 * hexScale.xy);
    // dot product
    vec4 temp = uv * uv;
    temp.xy = temp.xz + temp.yw;
    vec4 uvCenter = temp.x < temp.y ? vec4(uv.xy, center.xy) : vec4(uv.zw, center.zw + 0.5);
    // normalize UV range and transform center position to UV space
    uvCenter = uvCenter * vec4(r.xy, invScale) + vec4(0.5, 0.5, 0.0, 0.0);
    
    {
        // 60 degrees, tan of 30 degrees and one over angle
        const vec3 kAngles = vec3(1.047198, 0.954929249292, 0.523599);
        
        float size = isVertical ? invScale.x : invScale.y;
        p = (pos - uvCenter.zw) * scale * hexScale.xy * size;
        // rotate 90 degrees
        p = isVertical ? p: -p.yx;
        float radius = size * 0.5;
        temp.xy = vec2(radius, atan(p.y, p.x)) * kAngles.zy + vec2(0.0, 0.5);
        float angle = kAngles.x * floor(temp.y);
        vec2 rotation = vec2(sin(angle), cos(angle));
        p = p.x * rotation.yx * vec2(1.0, -1.0) + p.y * rotation;

        vec2 offset = vec2(radius, clamp(p.y, -temp.x, temp.x));
        edgeDistance = length(p - offset) / radius;
    }
    
    return uvCenter;
}

// 2D Gradient noise using an hexagonal grid.
// @param scale Number of tiles, must be an integer for tileable results, range: [1, inf]
// @param size The size of the gradient, range: [0, 2], default: 1.0
// @param jitter Jitter factor of the X and Y axis for the offsets, range: [0, 1], default: 1.0
// @param isVertical Changes the orientation of the hexagons.
// @return Value of the noise, range: [0, 1]
float noiseHexagons(vec2 pos, vec2 scale, float size, vec2 jitter, bool isVertical, bool useCenter)
{
    const float kSqrtThree = 1.73205080757;
    const float kHalfSqrtThree = 0.866025403785;
    const float kInvSqrtThree = 0.57735026919;
    
    vec2 invScale = 1.0 / scale;
    vec2 center;
    {
        vec4 hexScale = vec4(1.0, kSqrtThree, 1.0, kInvSqrtThree);
        hexScale = isVertical ? hexScale : hexScale.yxwz;
        vec4 r = vec4(1.0, kHalfSqrtThree, 0.5, kInvSqrtThree);
        r = isVertical ? r : r.yxwz;
    
        vec2 p = pos * scale * hexScale.xy;
        vec4 c = floor(p.xyxy * hexScale.zwzw + vec4(0.0, 0.0, -r.zw)) + 0.5;
        vec4 uv = p.xyxy - c * hexScale.xyxy + vec4(0.0, 0.0, -0.5 * hexScale.xy);
        // dot product
        vec4 temp = uv * uv;
        temp.xy = temp.xz + temp.yw;
        center = temp.x < temp.y ? c.xy : c.zw + 0.5;
        // normalize UV range and transform center position to UV space
        center = center * invScale;
    }
    
    // the horizontal/vertical and diagonal radii
    vec4 radii = isVertical ? invScale.yyxy * vec4(0.0, 0.33333333, 0.5, 0.1666666666) : invScale.xxxy * vec4(0.33333333, 0.0, 0.1666666666, 0.5);
    float radius = isVertical ? min(radii.y, radii.z) : min(radii.x, radii.w);

    jitter *= vec2(0.5, 0.5) * radius;
    vec4 p0 =  center.xyxy - radii, p1 =  center.xyxy + radii;
    vec4 hash0, hash1;
    betterHash2D(fract(p0) * 8192.0, fract(p1) * 8192.0, hash0, hash1);
    vec4 temp = hash0;
    hash0 = vec4(temp.xy, hash1.xy).xzyw * 2.0 - 1.0;
    hash1 = vec4(temp.zw, hash1.zw).xzyw * 2.0 - 1.0;
    
    vec4 dc;
    temp = pos.xyxy - p0 + hash0 * jitter.xyxy;
    temp *= temp;
    dc.xy = temp.xz + temp.yw;
    
    temp = pos.xyxy - p1 + hash1 * jitter.xyxy;
    temp *= temp;
    dc.zw = temp.xz + temp.yw;
    dc.xy = min(dc.xy, dc.zw);
    
    p0 = center.xyxy + radii.zwzw * vec4(-1.0, 1.0, 1.0, -1.0);
    betterHash2D(fract(p0) * 8192.0, fract(center.xyxy) * 8192.0, hash0, hash1);
    temp = hash0;
    hash0 = vec4(temp.xy, hash1.xy).xzyw * 2.0 - 1.0;
    hash1.xy = vec2(temp.z, hash1.z) * 2.0 - 1.0;
    
    temp = pos.xyxy - p0 + hash0 * jitter.xyxy;
    temp *= temp;
    dc.zw = temp.xz + temp.yw;
    dc.xy = min(dc.xy, dc.zw);
    
    float d = min(dc.x, dc.y);
    if (useCenter)
    {
        temp.xy = pos - center + hash1.xy * jitter.xy * 0.5;
        d = min(d, dot(temp.xy, temp.xy));
    }
    radius *= size;
    
    d = sqrt(d) - radius;
    return max(noiseInterpolate(-d / radius), 0.0);
}

// 2D Gradient noise using an hexagonal grid.
// @param scale Number of tiles, must be an integer for tileable results, range: [1, inf]
// @param size The size of the gradient, range: [0, 2], default: 1.0
// @param jitter Jitter factor of the X and Y axis for the offsets, range: [0, 1], default: 1.0
// @param isVertical Changes the orientation of the hexagons.
// @return x = value of the noise range: [0, 1], yz = derivative of the noise, range: [-1, 1]
vec3 noiseHexagonsd(vec2 pos, vec2 scale, float size, vec2 disorder, bool isVertical, bool useCenter)
{
    const float kSqrtThree = 1.73205080757;
    const float kHalfSqrtThree = 0.866025403785;
    const float kInvSqrtThree = 0.57735026919;
    
    vec2 invScale = 1.0 / scale;
    vec2 center;
    {
        vec4 hexScale = vec4(1.0, kSqrtThree, 1.0, kInvSqrtThree);
        hexScale = isVertical ? hexScale : hexScale.yxwz;
        vec4 r = vec4(1.0, kHalfSqrtThree, 0.5, kInvSqrtThree);
        r = isVertical ? r : r.yxwz;
    
        vec2 p = pos * scale * hexScale.xy;
        vec4 c = floor(p.xyxy * hexScale.zwzw + vec4(0.0, 0.0, -r.zw)) + 0.5;
        vec4 uv = p.xyxy - c * hexScale.xyxy + vec4(0.0, 0.0, -0.5 * hexScale.xy);
        // dot product
        vec4 temp = uv * uv;
        temp.xy = temp.xz + temp.yw;
        center = temp.x < temp.y ? c.xy : c.zw + 0.5;
        // normalize UV range and transform center position to UV space
        center = center * invScale;
    }
    
    // the horizontal/vertical and diagonal radii
    vec4 radii = isVertical ? invScale.yyxy * vec4(0.0, 0.33333333, 0.5, 0.1666666666) : invScale.xxxy * vec4(0.33333333, 0.0, 0.1666666666, 0.5);
    float radius = isVertical ? min(radii.y, radii.z) : min(radii.x, radii.w);

    disorder *= 0.5 * radius;
    vec4 p0 =  center.xyxy - radii, p1 =  center.xyxy + radii;
    vec4 hash0, hash1;
    betterHash2D(fract(p0) * 8192.0, fract(p1) * 8192.0, hash0, hash1);
    vec4 temp = hash0;
    hash0 = vec4(temp.xy, hash1.xy).xzyw * 2.0 - 1.0;
    hash1 = vec4(temp.zw, hash1.zw).xzyw * 2.0 - 1.0;
    
    vec4 dc;
    vec4 pc;
    p0 = pos.xyxy - p0 + hash0 * disorder.xyxy;
    temp = p0 * p0;
    dc.xy = temp.xz + temp.yw;
    
    p1 = pos.xyxy - p1 + hash1 * disorder.xyxy;
    temp = p1 * p1;
    dc.zw = temp.xz + temp.yw;
    pc = mix(p0, p1, step(dc.zw, dc.xy).xxyy);
    dc.xy = min(dc.xy, dc.zw);
    
    p0 = center.xyxy + radii.zwzw * vec4(-1.0, 1.0, 1.0, -1.0);
    betterHash2D(fract(p0) * 8192.0, fract(center.xyxy) * 8192.0, hash0, hash1);
    temp = hash0;
    hash0 = vec4(temp.xy, hash1.xy).xzyw * 2.0 - 1.0;
    hash1.xy = vec2(temp.z, hash1.z) * 2.0 - 1.0;
    
    p0 = pos.xyxy - p0 + hash0 * disorder.xyxy;
    temp = p0 * p0;
    dc.zw = temp.xz + temp.yw;
    pc = mix(pc, p0, step(dc.zw, dc.xy).xxyy);
    dc.xy = min(dc.xy, dc.zw);
    
    float d = min(dc.x, dc.y);
    pc.xy = dc.x < dc.y ? pc.xy : pc.zw;
    if (useCenter)
    {
        p0.xy = pos - center + hash1.xy * disorder.xy * 0.5;
        dc.x = dot(p0.xy, p0.xy);
        pc.xy = d < dc.x ? pc.xy : p0.xy;
        d = min(d, dc.x);
    }
    radius *= size;
    
    d = sqrt(d);
    vec2 dxdy = pc.xy / d;
    vec2 uDu = noiseInterpolateDu((radius - d) / radius);
    return vec3(uDu.x,  dxdy * (uDu.y * radius)) * step(0.0, uDu.x);
}

// ---- patterns.glsl ----
vec3 checkerboard(const in vec2 pos, const in vec2 scale, const in vec2 smoothness)
{
    // based on filtering the checkerboard by Inigo Quilez 
    vec2 numTiles = floor(scale); 
    vec2 p = pos * numTiles * 2.0;
    vec2 tile = mod(floor(p), numTiles * 2.0);
    
    vec2 w = max(smoothness, vec2(0.001));
    // box filter using triangular signal
    vec2 s1 = abs(fract((p - 0.5 * w) / 2.0) - 0.5);
    vec2 s2 = abs(fract((p + 0.5 * w) / 2.0) - 0.5);
    vec2 i = 2.0 * (s1 - s2) / w;
    float d = 0.5 - 0.5 * i.x * i.y; // xor pattern
    return vec3(d, tile);
}

vec3 checkerboard45(const in vec2 pos, const in vec2 scale, const in vec2 smoothness)
{
    // based on filtering the checkerboard by Inigo Quilez 
    const float sqrtOfTwo = 1.41421356237;
    
    vec2 numTiles = floor(scale); 
    vec2 p = pos * numTiles * 2.0;
    
    const mat2 rotate45 = mat2(0.70710678119, 0.70710678119, -0.70710678119, 0.70710678119);
    p *= 1.0 / sqrtOfTwo;
    p.x += sqrtOfTwo * 0.5;
    p = p * rotate45;

    vec2 w = max(smoothness, vec2(0.001));
    // box filter using triangular signal
    vec2 s1 = abs(fract((p - 0.5 * w) / 2.0) - 0.5);
    vec2 s2 = abs(fract((p + 0.5 * w) / 2.0) - 0.5);
    vec2 i = 2.0 * (s1 - s2) / w;
    float d = 0.5 - 0.5 * i.x * i.y; // xor pattern
    vec2 tile = mod(floor(p), numTiles);
    return vec3(d, tile);
}

float triangleWave(float x) 
{
    const float pi = 3.141592;
    float t = x / (pi * 2.0) + pi / 4.0;
    return abs(fract(t) * 2.0 - 1.0) * 2.0 - 1.0;
}

float wavePattern(vec2 pos, vec2 scale, float width, float smoothness, float amplitude, float interpolate)
{
    scale = floor(scale);
    const float pi = 3.141592;
    vec2 p;
    p.x = pos.x * pi * scale.x;
    p.y = pos.y * scale.y;
    
    float sy = p.y + amplitude * mix(triangleWave(p.x), sin(p.x), interpolate);
    float t = triangleWave(sy * scale.y * pi * 0.25);
    return 1.0 - smoothstep(max(width - smoothness, 0.0), width, t * 0.5 + 0.5);
}

float crossPattern(vec2 pos, vec2 scale, vec2 smoothness)
{
    scale = floor(scale);
    vec2 p = pos * scale;
    
    const float N = 3.0;
    vec2 w = max(smoothness, vec2(0.001));
    vec2 halfW = 0.5 * w;
    vec2 a = p + halfW;                        
    vec2 b = p - halfW;  
    
    vec2 x = floor(a) + min(fract(a) * N, 1.0) - floor(b) - min(fract(b) * N, 1.0);
    vec2 i = x / (N * w);
    return 1.0 - i.x - i.y + 2.0 * i.x * i.y;
}

float stairsPattern(vec2 pos, vec2 scale, float width, float smoothness, float distance)   
{
    vec2 p = pos * scale;
    vec2 f = fract(p);
    
    vec2 m = floor(mod(p, vec2(2.0)));
    float d = mix(f.x, f.y, abs(m.x - m.y));
    d = mix(d, abs(d * 2.0 - 1.0), distance);
    
    return 1.0 - smoothstep(max(width - smoothness, 0.0), width, d);        
}

float sdfLens(vec2 p, float width, float height)
{
    // Vesica SDF based on Inigo Quilez
    float d = height / width - width / 4.0;
    float r = width / 2.0 + d;
    
    p = abs(p);

    float b = sqrt(r * r - d * d);
    vec4 par = p.xyxy - vec4(0.0, b, -d, 0.0);
    return (par.y * d > p.x * b) ? length(par.xy) : length(par.zw) - r;
}

vec3 tileWeave(vec2 pos, vec2 scale, float count, float width, float smoothness)
{
    vec2 i = floor(pos * scale);    
    float c = mod(i.x + i.y, 2.0);
    
    vec2 p = fract(pos.st * scale);
    p = mix(p.st, p.ts, c);
    p = fract(p * vec2(count, 1.0));
    
    width *= 2.0;
    p = p * 2.0 - 1.0;
    float d = sdfLens(p, width, 1.0);
    vec2 grad = vec2(dFdx(d), dFdy(d));

    float s = 1.0 - smoothstep(0.0, dot(abs(grad), vec2(1.0)) + smoothness, -d);
    return vec3(s, normalize(grad) * smoothstep(1.0, 0.99, s) * smoothstep(0.0, 0.01, s)); 
}

float sdfCapsule(vec2 p, float radiusA, float radiusB, float height)
{
    // Capsule SDF based on Inigo Quilez
    p.x = abs(p.x);
    p.y += height * 0.5;
    
    float b = (radiusA - radiusB) / height;
    vec2 c = vec2(sqrt(1.0 - b * b), b);
    vec3 mnk = vec3(c.x, p.x, c.x) * p.xxy + vec3(c.y, p.y, -c.y) * p.yyx;
    
    if( mnk.z < 0.0   ) 
        return sqrt(mnk.y) - radiusA;
    else if(mnk.z > c.x * height) 
        return sqrt(mnk.y + height * height - 2.0 * height * p.y) - radiusB;
    return mnk.x - radiusA;
}
vec3 tileWeave(vec2 pos, vec2 scale, float count, vec2 width, float smoothness)
{
    vec2 i = floor(pos * scale);    
    float c = mod(i.x + i.y, 2.0);
    
    vec2 p = fract(pos.st * scale);
    p = mix(p.st, p.ts, c);
    p = fract(p * vec2(count, 1.0));
    
    p = p * 2.0 - 1.0;
    float d = sdfCapsule(p, width.x, width.y, 1.0 - max(width.x, width.y) * 0.75);
    vec2 grad = vec2(dFdx(d), dFdy(d));

    float s = 1.0 - smoothstep(0.0, dot(abs(grad), vec2(1.0)) + smoothness, -d);
    return vec3(s, normalize(grad) * smoothstep(1.0, 0.99, s) * smoothstep(0.0, 0.01, s)); 
}
`;
