"""Trang chấm tay query ghép (E3c, E6) — chạy local, lưu thẳng vào judgments.csv.

    uv run python -m experiments judge            # → http://127.0.0.1:8765 (tự mở trình duyệt)

Mỗi query hiện mọi ảnh trong pool (top-20 của mọi cấu hình E3c/E6, đã gộp, xáo trộn để
không lộ cấu hình nào xếp ảnh nào). Hai chế độ: TỪNG ẢNH (ảnh lớn, Y/N tự sang ảnh kế) và
LƯỚI (bấm ảnh: chưa chấm → ĐÚNG → SAI). Enter = "các ảnh còn lại là SAI" + sang query kế.
Mỗi lần bấm lưu ngay (ghi nguyên tử).
Chỉ nghe trên 127.0.0.1; chỉ phục vụ ảnh trong Data/open-images/test có tên hex hợp lệ.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import threading
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from experiments import judging
from experiments.core import CommonParams, opt
from experiments.oi_data import images_dir

ID_RE = re.compile(r"^[0-9a-f]{16}$")
_lock = threading.Lock()


@dataclass
class JudgeParams(CommonParams):
    port: int = opt(8765, "Cổng HTTP (chỉ 127.0.0.1).")
    open_browser: bool = opt(True, "Tự mở trình duyệt.")
    thumb: int = opt(384, "Cạnh dài ảnh thu nhỏ (px).")


# ── dữ liệu pool ──────────────────────────────────────────────────────────
def load_pool(root: Path) -> list[dict]:
    path = judging.pool_path(root)
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def save_pool(root: Path, rows: list[dict]) -> None:
    path = judging.pool_path(root)
    tmp = path.with_suffix(".csv.tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=judging.FIELDS)
        writer.writeheader()
        writer.writerows({k: r.get(k, "") for k in judging.FIELDS} for r in rows)
    tmp.replace(path)


def set_judgment(root: Path, query_id: str, image_id: str, value: str) -> bool:
    with _lock:
        rows = load_pool(root)
        hit = False
        for r in rows:
            if r["query_id"] == query_id and r["image_id"] == image_id:
                r["relevant"] = value
                hit = True
        if hit:
            save_pool(root, rows)
        return hit


def fill_rest(root: Path, query_id: str) -> int:
    """Ảnh chưa chấm của query → 0 (sai)."""
    with _lock:
        rows = load_pool(root)
        n = 0
        for r in rows:
            if r["query_id"] == query_id and r["relevant"] not in ("0", "1"):
                r["relevant"] = "0"
                n += 1
        if n:
            save_pool(root, rows)
        return n


def queries_payload(root: Path) -> list[dict]:
    queries = judging.read_queries()
    rows = load_pool(root)
    out = []
    for q in queries:
        mine = [r for r in rows if r["query_id"] == q["id"]]
        if not mine:
            continue
        # thứ tự cố định nhưng "xáo" theo hash → người chấm không đoán được cấu hình / hạng
        mine.sort(key=lambda r: hashlib.md5(f"{q['id']}{r['image_id']}".encode()).hexdigest())
        out.append({"id": q["id"], "en": q.get("query_en", ""), "vi": q.get("query_vi", ""),
                    "images": [{"id": r["image_id"], "v": r["relevant"]} for r in mine]})
    return out


# ── HTTP ──────────────────────────────────────────────────────────────────
PAGE = r"""<!doctype html><html lang="vi"><meta charset="utf-8"><title>Chấm query ghép</title>
<style>
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font-family:system-ui,sans-serif;display:flex;color:#222;background:#fafaf7;overflow:hidden}
#side{width:270px;flex:none;border-right:1px solid #ddd;overflow-y:auto;background:#fff}
#side h2{font-size:13px;margin:12px;color:#666;text-transform:uppercase;letter-spacing:.05em}
.q{padding:8px 12px;cursor:pointer;border-left:3px solid transparent;font-size:13px}
.q:hover{background:#f3f3ef}.q.on{background:#eef4ff;border-left-color:#2563eb}
.q small{display:block;color:#888}.q .done{color:#16a34a}
#main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
header{flex:none;padding:12px 20px;border-bottom:1px solid #ddd;background:#fff}
header .en{font-size:22px;font-weight:600}header .vi{color:#666;margin-top:2px}
#bar{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px;flex-wrap:wrap}
button{font:inherit;padding:6px 12px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer}
button.primary{background:#2563eb;color:#fff;border-color:#2563eb}
button.mode{background:#111;color:#fff;border-color:#111}
details{font-size:12px;color:#555;line-height:1.5;margin-top:8px}
details div{background:#fffbe6;border:1px solid #f0e2a0;padding:8px 12px;border-radius:6px;margin-top:4px}
kbd{border:1px solid #bbb;border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:11px;background:#fff}
/* lưới: ô có chiều cao cố định → không bao giờ đè nhau */
#grid{flex:1;min-height:0;overflow-y:auto;padding:16px;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(210px,1fr));grid-auto-rows:230px;gap:12px}
.card{position:relative;border:4px solid #ddd;border-radius:8px;overflow:hidden;cursor:pointer;background:#e5e5e0;min-width:0}
.card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.card.y{border-color:#16a34a}.card.n{border-color:#dc2626}.card.n img{opacity:.4}
.tag{position:absolute;top:6px;left:6px;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;color:#fff;z-index:1}
.y .tag{background:#16a34a}.n .tag{background:#dc2626}
.num{position:absolute;bottom:6px;left:6px;background:#0009;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;z-index:1}
/* từng ảnh */
#single{flex:1;min-height:0;display:none;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:12px}
#single .frame{flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center}
#single img{max-width:100%;max-height:100%;object-fit:contain;border:6px solid #ddd;border-radius:8px;background:#eee}
#single img.y{border-color:#16a34a}#single img.n{border-color:#dc2626}
#single .ctl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center}
#single .yes{background:#16a34a;color:#fff;border-color:#16a34a;font-size:16px;padding:10px 22px}
#single .no{background:#dc2626;color:#fff;border-color:#dc2626;font-size:16px;padding:10px 22px}
#single .state{font-weight:600;min-width:90px;text-align:center}
#big{position:fixed;inset:0;background:#000d;display:none;align-items:center;justify-content:center;z-index:9}
#big img{max-width:94vw;max-height:94vh}
</style>
<div id="side"><h2>Query <span id="total"></span></h2><div id="list"></div></div>
<div id="main"><header>
<div class="en" id="qen"></div><div class="vi" id="qvi"></div>
<div id="bar"><span id="count"></span>
<button class="mode" id="modeBtn" onclick="toggleMode()"></button>
<button onclick="goQ(-1)">← Query trước</button><button onclick="goQ(1)">Query sau →</button>
<button class="primary" onclick="finish()">Xong: ảnh còn lại = SAI (Enter)</button></div>
<details open><summary>Cách chấm &amp; phím tắt</summary><div>
ĐÚNG khi ảnh khớp <b>toàn bộ</b> câu (vd "chó trên bãi biển" cần <i>cả</i> chó <i>và</i> bãi biển). Vật thể nhìn thấy rõ là được, không cần là chủ thể chính;
số lượng / màu / hành động trong câu phải đúng. Phân vân → SAI.<br>
<b>Lưới:</b> bấm ảnh = chưa chấm → ĐÚNG → SAI → chưa chấm · Shift+bấm = xem to · <kbd>Enter</kbd> = còn lại SAI + query kế.<br>
<b>Từng ảnh:</b> <kbd>Y</kbd>/<kbd>1</kbd> = ĐÚNG · <kbd>N</kbd>/<kbd>0</kbd> = SAI (tự sang ảnh kế) · <kbd>←</kbd><kbd>→</kbd> = ảnh trước/sau ·
<kbd>U</kbd> = bỏ chấm · <kbd>[</kbd><kbd>]</kbd> = query trước/sau · <kbd>G</kbd> = về lưới. Mọi thao tác lưu ngay.
</div></details></header>
<div id="grid"></div>
<div id="single"><div class="frame"><img id="simg"></div>
<div class="ctl"><button onclick="step(-1)">← Trước</button>
<button class="no" onclick="mark('0')">✗ SAI (N)</button><span class="state" id="sstate"></span>
<button class="yes" onclick="mark('1')">✓ ĐÚNG (Y)</button><button onclick="step(1)">Sau →</button>
<span id="spos" style="color:#666;font-size:13px"></span></div></div>
</div>
<div id="big" onclick="this.style.display='none'"><img></div>
<script>
let Q=[],cur=0,idx=0,mode=localStorage.getItem('judgeMode')||'single';
const cycle={"":"1","1":"0","0":""};
async function load(){Q=await (await fetch('/api/queries')).json();
 const i=Q.findIndex(q=>q.images.some(x=>x.v===''));cur=i<0?0:i;idx=firstOpen();render();}
const stat=q=>[q.images.filter(x=>x.v!=='').length,q.images.length];
function firstOpen(){const k=Q[cur].images.findIndex(x=>x.v==='');return k<0?0:k}
function renderSide(){const L=document.getElementById('list');L.innerHTML='';let all=0,done=0;
 Q.forEach((q,i)=>{const [d,n]=stat(q);all+=n;done+=d;const el=document.createElement('div');
  el.className='q'+(i===cur?' on':'');el.onclick=()=>{cur=i;idx=firstOpen();render()};
  el.innerHTML=`${q.id} · ${q.en}<small class="${d===n?'done':''}">${d===n?'✓ xong':d+'/'+n}</small>`;L.appendChild(el);});
 document.getElementById('total').textContent=`— ${done}/${all} cặp`;
 document.querySelector('.q.on')?.scrollIntoView({block:'nearest'});}
function render(){renderSide();const q=Q[cur];
 document.getElementById('qen').textContent=`${q.id} · ${q.en}`;document.getElementById('qvi').textContent=q.vi;
 const [d,n]=stat(q),y=q.images.filter(x=>x.v==='1').length;
 document.getElementById('count').textContent=`${d}/${n} đã chấm · ${y} đúng`;
 document.getElementById('modeBtn').textContent=mode==='single'?'▦ Xem dạng lưới':'▢ Xem từng ảnh';
 document.getElementById('grid').style.display=mode==='grid'?'grid':'none';
 document.getElementById('single').style.display=mode==='single'?'flex':'none';
 mode==='grid'?renderGrid(q):renderSingle(q);}
function renderGrid(q){const G=document.getElementById('grid');G.innerHTML='';
 q.images.forEach((im,k)=>{const c=document.createElement('div');c.className='card'+(im.v==='1'?' y':im.v==='0'?' n':'');
  c.innerHTML=`<img loading="lazy" src="/img/${im.id}"><span class="tag">${im.v==='1'?'ĐÚNG':im.v==='0'?'SAI':''}</span><span class="num">${k+1}</span>`;
  c.onclick=e=>{if(e.shiftKey){zoom(im.id);return}save(q,im,cycle[im.v])};G.appendChild(c);});}
function renderSingle(q){idx=Math.max(0,Math.min(q.images.length-1,idx));const im=q.images[idx];
 const img=document.getElementById('simg');img.src='/img/'+im.id+'?full=1';img.className=im.v==='1'?'y':im.v==='0'?'n':'';
 document.getElementById('sstate').textContent=im.v==='1'?'ĐÚNG':im.v==='0'?'SAI':'chưa chấm';
 document.getElementById('sstate').style.color=im.v==='1'?'#16a34a':im.v==='0'?'#dc2626':'#888';
 document.getElementById('spos').textContent=`ảnh ${idx+1}/${q.images.length}`;
 const nx=q.images[idx+1];if(nx){new Image().src='/img/'+nx.id+'?full=1'}}
function toggleMode(){mode=mode==='single'?'grid':'single';localStorage.setItem('judgeMode',mode);render()}
function zoom(id){const b=document.getElementById('big');b.querySelector('img').src='/img/'+id+'?full=1';b.style.display='flex'}
async function save(q,im,v){const r=await fetch('/api/judge',{method:'POST',body:JSON.stringify({query_id:q.id,image_id:im.id,relevant:v})});
 if(!r.ok){alert('Lưu lỗi: '+await r.text());return false}im.v=v;render();return true}
async function mark(v){const q=Q[cur];if(!(await save(q,q.images[idx],v)))return;
 if(v==='')return;const k=q.images.findIndex((x,j)=>j>idx&&x.v==='');
 if(k>=0){idx=k}else if(q.images.every(x=>x.v!=='')){nextOpenQuery()}else{idx=Math.min(idx+1,q.images.length-1)}render()}
function step(d){idx=Math.max(0,Math.min(Q[cur].images.length-1,idx+d));render()}
function nextOpenQuery(){const i=Q.findIndex((x,k)=>k>cur&&x.images.some(y=>y.v===''));
 if(i>=0){cur=i;idx=firstOpen()}else{alert('Đã chấm hết query sau query này 🎉')}}
async function finish(){const q=Q[cur];const r=await fetch('/api/fill',{method:'POST',body:JSON.stringify({query_id:q.id})});
 if(!r.ok){alert('Lưu lỗi');return}q.images.forEach(x=>{if(x.v==='')x.v='0'});nextOpenQuery();render();document.getElementById('grid').scrollTop=0}
function goQ(d){cur=Math.max(0,Math.min(Q.length-1,cur+d));idx=firstOpen();render();document.getElementById('grid').scrollTop=0}
document.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;
 const big=document.getElementById('big');if(big.style.display==='flex'){big.style.display='none';return}
 const k=e.key.toLowerCase();
 if(k==='enter'){e.preventDefault();finish();return}
 if(k==='g'){toggleMode();return}
 if(mode==='single'){
  if(k==='y'||k==='1')mark('1');else if(k==='n'||k==='0')mark('0');else if(k==='u')mark('');
  else if(k==='arrowright')step(1);else if(k==='arrowleft')step(-1);
  else if(k===']')goQ(1);else if(k==='[')goQ(-1);else return;e.preventDefault();
 }else{if(k==='arrowright'||k===']')goQ(1);else if(k==='arrowleft'||k==='[')goQ(-1)}});
load();
</script></html>"""


def make_handler(root: Path, thumb: int):
    img_dir = images_dir(root, "test")
    cache: dict[str, bytes] = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):  # im lặng
            pass

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store" if ctype.startswith("application/json") else "max-age=3600")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802
            url = urlparse(self.path)
            if url.path == "/":
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            if url.path == "/api/queries":
                return self._send(200, json.dumps(queries_payload(root), ensure_ascii=False).encode(),
                                  "application/json; charset=utf-8")
            if url.path.startswith("/img/"):
                image_id = url.path[5:]
                if not ID_RE.match(image_id):
                    return self._send(404, b"bad id", "text/plain")
                path = img_dir / f"{image_id}.jpg"
                if not path.exists():
                    return self._send(404, b"missing", "text/plain")
                if "full=1" in url.query:
                    return self._send(200, path.read_bytes(), "image/jpeg")
                if image_id not in cache:
                    from PIL import Image, ImageOps

                    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
                    im.thumbnail((thumb, thumb))
                    buf = io.BytesIO()
                    im.save(buf, "JPEG", quality=82)
                    cache[image_id] = buf.getvalue()
                return self._send(200, cache[image_id], "image/jpeg")
            return self._send(404, b"not found", "text/plain")

        def do_POST(self):  # noqa: N802
            try:
                length = int(self.headers.get("Content-Length") or 0)
                data = json.loads(self.rfile.read(min(length, 10_000)) or b"{}")
            except (ValueError, json.JSONDecodeError):
                return self._send(400, b"bad json", "text/plain")
            qid, iid = str(data.get("query_id", "")), str(data.get("image_id", ""))
            if self.path == "/api/judge":
                value = str(data.get("relevant", ""))
                if value not in ("", "0", "1") or not ID_RE.match(iid):
                    return self._send(400, b"bad value", "text/plain")
                ok = set_judgment(root, qid, iid, value)
                return self._send(200 if ok else 404, b"ok" if ok else b"pair not in pool", "text/plain")
            if self.path == "/api/fill":
                n = fill_rest(root, qid)
                return self._send(200, json.dumps({"filled": n}).encode(), "application/json")
            return self._send(404, b"not found", "text/plain")

    return Handler


def run(p: JudgeParams) -> dict:
    root = p.root
    if not judging.pool_path(root).exists():
        raise SystemExit("Chưa có judgments.csv — chạy `e3 --parts c` hoặc `e6` trước để tạo pool.")
    server = ThreadingHTTPServer(("127.0.0.1", p.port), make_handler(root, p.thumb))
    url = f"http://127.0.0.1:{p.port}"
    print(f"Trang chấm: {url}  (Ctrl+C để dừng) · lưu vào {judging.pool_path(root)}", flush=True)
    if p.open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return {}
