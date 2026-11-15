// GLSL của basic edit — 1 pass, chạy trên GPU nên kéo thanh trượt là thấy ngay.
// Thứ tự: cân bằng trắng + phơi sáng (tuyến tính) → điểm đen/trắng → vùng tối /
// vùng sáng → tương phản → độ rực / bão hoà → vignette.
// Đổi công thức ở đây = ảnh đã lưu trước đó sẽ khác khi mở lại editor.

export const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // ImageBitmap không lật Y → lật ở đây (gốc ảnh ở trên-trái).
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_aspect;      // (w/h, 1) — vignette tròn theo khung ảnh
uniform float u_exposure;   // EV
uniform float u_contrast;   // các uniform còn lại: −1…1
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_temperature;
uniform float u_tint;
uniform float u_vibrance;
uniform float u_saturation;
uniform float u_vignette;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // Cân bằng trắng + phơi sáng trong không gian tuyến tính (gần sRGB = gamma 2.2).
  vec3 lin = pow(c, vec3(2.2));
  lin *= vec3(1.0 + 0.2 * u_temperature, 1.0 - 0.2 * u_tint, 1.0 - 0.2 * u_temperature);
  lin *= exp2(u_exposure);
  c = pow(max(lin, 0.0), vec3(1.0 / 2.2));

  // Điểm đen / trắng (levels).
  float bp = -0.15 * u_blacks;
  float wp = 1.0 - 0.15 * u_whites;
  c = (c - bp) / max(wp - bp, 0.05);

  // Vùng tối / vùng sáng: mặt nạ mềm theo độ sáng.
  float l = clamp(luma(c), 0.0, 1.0);
  float shadowMask = 1.0 - smoothstep(0.0, 0.6, l);
  float highlightMask = smoothstep(0.4, 1.0, l);
  c *= 1.0 + 0.6 * u_shadows * shadowMask + 0.5 * u_highlights * highlightMask;

  // Tương phản quanh xám giữa.
  c = mix(vec3(0.5), c, 1.0 + 0.8 * u_contrast);

  // Độ rực (ưu tiên màu nhạt) rồi bão hoà.
  l = luma(c);
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  c = mix(vec3(l), c, 1.0 + u_vibrance * (1.0 - clamp(sat, 0.0, 1.0)));
  c = mix(vec3(luma(c)), c, 1.0 + u_saturation);

  // Vignette: dương = tối viền, âm = sáng viền.
  vec2 d = (v_uv - 0.5) * u_aspect;
  float r = length(d) / length(0.5 * u_aspect);
  c *= 1.0 - 0.8 * u_vignette * smoothstep(0.35, 1.0, r);

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
