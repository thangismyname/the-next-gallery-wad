// WebGL2 renderer của basic edit (không React). Canvas = đúng kích thước ảnh
// nguồn (bản display ≤2048px) → bản xem trước cũng chính là ảnh được lưu.
import type { EditRecipe } from "@tng/shared";
import type { AdjustKey } from "../recipe";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shader";

const PERCENT_KEYS: AdjustKey[] = [
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "vignette",
];

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export class EditRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private uniforms = new Map<string, WebGLUniformLocation | null>();

  /** Ném lỗi nếu trình duyệt không có WebGL2 — caller hiện thông báo. */
  constructor(private canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: toBlob đọc được khung hình đã vẽ.
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false, alpha: false });
    if (!gl) throw new Error("WEBGL2_UNAVAILABLE");
    this.gl = gl;

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(program)}`);
    this.program = program;
    gl.useProgram(program);

    // 1 tam giác lớn phủ kín khung (đủ cho full-screen pass).
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private uniform(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  setImage(image: ImageBitmap) {
    const { gl } = this;
    this.canvas.width = image.width;
    this.canvas.height = image.height;
    gl.viewport(0, 0, image.width, image.height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform2f(this.uniform("u_aspect"), image.width / image.height, 1);
  }

  render(recipe: EditRecipe) {
    const { gl } = this;
    gl.uniform1f(this.uniform("u_exposure"), recipe.exposure);
    for (const key of PERCENT_KEYS) gl.uniform1f(this.uniform(`u_${key}`), recipe[key] / 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Ảnh đang hiển thị → WebP (Safari chưa mã hoá WebP → trả PNG, server nhận cả 2). */
  toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("EXPORT_FAILED"))), "image/webp", 0.92),
    );
  }

  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
