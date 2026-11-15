"""Tóm tắt dễ hiểu E1–E6 theo version → Results/oi/SUMMARY.md.

Khác REPORT.md (bảng đầy đủ), file này viết bằng lời: mỗi thí nghiệm hỏi gì, kết quả
chính, nghĩa là gì — kèm bảng "thay đổi so với version trước". Tự cập nhật sau mỗi run
chính thức E1–E6 (core.Run); chạy tay: `uv run python -m experiments summary`.

Version: mỗi lần metric chính khác lần trước → version mới vNNN.
  History/summary/index.csv          1 dòng / version (thời điểm, run nào kích hoạt, metric chính)
  History/summary/SUMMARY_vNNN.md    bản chụp từng version
Metric không đổi (vd chạy `summary` 2 lần) → không tạo version mới, chỉ ghi lại file.
"""
from __future__ import annotations

import csv
import json
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from bench.common import history_dir
from experiments.core import CommonParams, data_fingerprint, find_run, result_root, write_csv

EXPS = ("e1", "e2", "e3", "e4", "yolo_ft", "e5", "probe", "e6")
PROBE_LADDER_LABELS = {
    "lp_clip-zs_clip": "train (cùng feature CLIP) vs zero-shot",
    "lp_dino-lp_clip": "DINO vs CLIP (cùng có train)",
    "fused_learned-lp_clip": "thêm nguồn độc lập (DINO + YOLO) vs chỉ CLIP",
    "fused_learned-e5_per_tag": "fusion có học vs quy tắc chọn tay (E5)",
}


@dataclass
class SummaryParams(CommonParams):
    pass


# ── đọc kết quả ───────────────────────────────────────────────────────────
def _load(root: Path, exp: str) -> tuple[dict | None, str]:
    try:
        run = find_run(root, exp)
    except SystemExit:
        return None, ""
    return json.loads((run / "result.json").read_text()), run.name


def _f(x, digits: int = 3) -> str:
    if x is None or x == "":
        return "–"
    try:
        x = float(x)
    except (TypeError, ValueError):
        return str(x)
    return "–" if x != x else f"{x:.{digits}f}"


def _sf(x) -> str:
    """Số có dấu (+0.069 / -0.012)."""
    return "–" if x is None else f"{float(x):+.3f}"


def _pct(x) -> str:
    return "–" if x is None else f"{100 * float(x):.0f}%"


def _ci_sig(lo, hi) -> str:
    if lo is None or hi is None:
        return "chưa có CI"
    if lo > 0:
        return "**tốt hơn thật** (CI không chứa 0)"
    if hi < 0:
        return "**kém hơn thật** (CI không chứa 0)"
    return "chưa chắc khác (CI chứa 0)"


# ── metric chính (để so version) ──────────────────────────────────────────
def key_metrics(res: dict) -> dict[str, float | str]:
    """{tên metric dễ đọc: giá trị} — cột trong index.csv và bảng Δ."""
    out: dict[str, float | str] = {}
    e1 = res.get("e1")
    if e1:
        for r in e1["rows"]:
            if "pass" in r:
                ds = "Flickr" if r["dataset"] == "flickr30k" else "COCO"
                out[f"E1 {ds} câu→ảnh R@1 (%)"] = r["t2i_R@1"]
                out[f"E1 {ds} ảnh→câu R@1 (%)"] = r["i2t_R@1"]
    e2 = res.get("e2")
    if e2:
        out["E2 tag CLIP mAP"] = e2["test"]["mAP"]
        out["E2 tag CLIP macro-F1"] = e2["test"]["macro_f1"]
        out["E2 ECE sau calibrate"] = e2["test"]["ece_calibrated"]
    e3 = res.get("e3")
    if e3:
        if e3.get("a_class_queries"):
            out["E3a tìm theo tên lớp mAP"] = e3["a_class_queries"]["known_all"]["AP"]
        if e3.get("b_captions", {}).get("full"):
            out["E3b tìm bằng câu dài R@10"] = e3["b_captions"]["full"]["R@10"]
            out["E3b MRR"] = e3["b_captions"]["full"]["MRR"]
        c = e3.get("c_compositional") or {}
        for key, label in (("en@app", "tiếng Anh"), ("vi@app", "tiếng Việt, CLIP app"),
                           ("vi@multilingual", "tiếng Việt, CLIP đa ngữ")):
            v = c.get(key)
            if isinstance(v, dict) and (v.get("judged_fraction") or 0) >= 1:
                out[f"E3c query ghép P@10 ({label})"] = v.get("P@10")
    e4 = res.get("e4")
    if e4:
        out["E4 YOLO vẽ khung mAP@0.5"] = e4["test_detection_mAP50"]
        tuned = next((r for r in e4["test_tag"] if r["thresholds"] == "tuned_on_val"), None)
        if tuned:
            out["E4 tag YOLO macro-F1"] = tuned["macro_f1"]
    e5 = res.get("e5")
    if e5:
        h = e5["test_all_classes"]
        for key, label in (("per_tag", "gộp theo tag"), ("clip_only", "chỉ CLIP"), ("yolo_only", "chỉ YOLO"),
                           ("or", "luôn OR")):
            if key in h:
                out[f"E5 macro-F1 {label}"] = h[key]["macro_f1"]
    yf = res.get("yolo_ft")
    if yf:
        u = yf.get("ultralytics_test") or {}
        out["YOLO-FT test mAP@50-95"] = u.get("mAP50_95")
        out["YOLO-FT test mAP@50"] = u.get("mAP50")
        for t in yf.get("tag", []):
            if t["set"] in ("coco", "gap"):
                out[f"YOLO-FT tag mAP {t['model']} {t['set']}"] = t["mAP"]
    pr = res.get("probe")
    if pr:
        for n, h in pr.get("test_all_classes", {}).items():
            out[f"Probe mAP {n}"] = h.get("mAP")
            out[f"Probe macro-F1@P {n}"] = h.get("macro_f1_at_precision")
    e6 = res.get("e6")
    if e6 and e6.get("captions"):
        rows = e6["captions"]["rows"]
        base = next(r for r in rows if r["mode"] == "clip")
        best = max((r for r in rows if r["mode"].startswith("boost") and not _ceiling(r)), key=lambda r: r["MRR"],
                   default=None)
        out["E6 MRR CLIP thuần"] = base["MRR"]
        if best:
            out["E6 MRR boost tốt nhất"] = best["MRR"]
        oracle = next((r for r in rows if r["mode"] == "boost" and _ceiling(r)), None)
        if oracle:
            out["E6 MRR trần (boost oracle)"] = oracle["MRR"]
    comp = (e6 or {}).get("compositional")
    if comp and not comp.get("unjudged_pairs"):
        rows = comp["rows"]
        out["E6 query ghép P@10 CLIP thuần"] = next(r["P@10"] for r in rows if r["mode"] == "clip")
        for mode, label in (("boost", "boost"), ("filter", "lọc cứng")):
            best = max((r for r in rows if r["mode"].startswith(mode) and not _ceiling(r)), key=lambda r: r["P@10"],
                       default=None)
            if best:
                out[f"E6 query ghép P@10 {label} tốt nhất"] = best["P@10"]
    return {k: (round(float(v), 4) if isinstance(v, (int, float)) and not isinstance(v, bool) else v)
            for k, v in out.items() if v is not None}


# ── phần lời ──────────────────────────────────────────────────────────────
def text_e1(r: dict | None) -> list[str]:
    out = ["## E1 — Pipeline CLIP có đúng không?",
           "_Chạy lại đúng CLIP của paper (ViT-L/14@336px) trên Flickr30k và COCO, so với số paper công bố "
           "(Table 13). Lệch quá 2 điểm R@1 thì có thể code sai._"]
    if not r:
        return out + ["Chưa chạy."]
    rows = [x for x in r["rows"] if "pass" in x]
    for x in rows:
        ds = "Flickr30k" if x["dataset"] == "flickr30k" else "COCO 5K"
        out.append(f"- **{ds}**: câu→ảnh R@1 **{_f(x['t2i_R@1'], 1)}** (paper {_f(x.get('pub_t2i_R@1'), 1)}, "
                   f"lệch {_f(x.get('delta_t2i_R@1'), 1)}) · ảnh→câu R@1 **{_f(x['i2t_R@1'], 1)}** "
                   f"(paper {_f(x.get('pub_i2t_R@1'), 1)}, lệch {_f(x.get('delta_i2t_R@1'), 1)}) → "
                   f"{'✅ đạt' if x['pass'] else '❌ lệch'}")
    i2t_ok = all(abs(x.get("delta_i2t_R@1") or 0) <= 2 for x in rows)
    t2i_ok = all(abs(x.get("delta_t2i_R@1") or 0) <= 2 for x in rows)
    if r.get("all_pass"):
        meaning = "Pipeline tái lập đúng paper → các kết quả CLIP phía sau đáng tin."
    elif i2t_ok and not t2i_ok:
        meaning = ("Chiều ảnh→câu khớp paper nên phần xử lý **ảnh** đúng; chỉ chiều câu→ảnh lệch → khác biệt nằm ở "
                   "phía **chữ** (cách xử lý caption / tiền tố prompt), không phải lỗi encode ảnh.")
    else:
        meaning = "Lệch ở cả hai chiều → kiểm tra lại pipeline trước khi tin các kết quả sau."
    backend = [x for x in r["rows"] if x["preprocess"] == "backend"]
    raw = {(x["dataset"], x["caption_prefix"]): x for x in r["rows"] if x["preprocess"] == "raw"}
    if backend:
        drops = [abs(x["t2i_R@1"] - raw[(x["dataset"], x["caption_prefix"])]["t2i_R@1"])
                 for x in backend if (x["dataset"], x["caption_prefix"]) in raw]
        if drops:
            meaning += (f" Ảnh đi qua pipeline app (WebP ≤512 px) chỉ thay đổi R@1 tối đa {max(drops):.1f} điểm "
                        "→ cách app nén ảnh không làm hỏng chất lượng.")
    return out + [f"**Nghĩa là:** {meaning}"]


def text_e2(r: dict | None) -> list[str]:
    out = ["## E2 — CLIP tự gắn tag tốt đến đâu? (RQ1)",
           "_Mỗi lớp: so ảnh với câu prompt → điểm; ngưỡng riêng từng lớp chọn trên val; calibrate để điểm thành "
           "xác suất đáng tin. Báo cáo trên 5.000 ảnh test._"]
    if not r:
        return out + ["Chưa chạy."]
    t, ci = r["test"], r.get("test_ci95", {})
    groups = {g["group"]: g for g in r.get("groups", [])}
    obj, scn = groups.get("object", {}), groups.get("scene", {})
    out += [f"- Prompt tốt nhất (chọn trên val): `{r['template']}`",
            f"- mAP **{_f(t['mAP'])}** (CI95 {_f(ci.get('mAP_lo'))}–{_f(ci.get('mAP_hi'))}) · macro-F1 **{_f(t['macro_f1'])}**",
            f"- Cảnh **{_f(scn.get('mAP'))}** vs vật thể **{_f(obj.get('mAP'))}** "
            f"({'cảnh dễ hơn — cảnh chiếm cả ảnh, vật thể có thể rất nhỏ' if (scn.get('mAP') or 0) > (obj.get('mAP') or 0) else 'vật thể dễ hơn'})",
            f"- Độ tin cậy (ECE, càng gần 0 càng tốt): **{_f(t['ece_raw'])} → {_f(t['ece_calibrated'])}** sau calibrate"]
    good = (t["ece_calibrated"] or 1) < 0.05
    return out + [f"**Nghĩa là:** CLIP gắn tag {'tốt' if t['mAP'] >= 0.85 else 'khá' if t['mAP'] >= 0.7 else 'còn yếu'}"
                  f"{'; sau calibrate, khi app báo \"85% là biển\" thì con số đó gần đúng thật — đáp ứng yêu cầu tag kèm độ tin cậy' if good else ''}."]


def text_e3(r: dict | None) -> list[str]:
    out = ["## E3 — CLIP tìm ảnh tốt đến đâu? (RQ1)"]
    if not r:
        return out + ["Chưa chạy."]
    a, b, c = r.get("a_class_queries"), r.get("b_captions"), r.get("c_compositional")
    if a:
        k, s = a["known_all"], a["strict_all"]
        out.append(f"- **(a) Gõ tên lớp** (vd \"dog\"): mAP **{_f(k['AP'])}**, trung bình "
                   f"**{10 * k['P@10']:.1f}/10** ảnh đầu là đúng. Nếu coi ảnh *chưa ai kiểm tra* là sai thì mAP chỉ "
                   f"{_f(s['AP'])} — khoảng cách {_f(k['AP'] - s['AP'])} phần lớn do **nhãn Open Images thiếu**, "
                   "không phải model kém (xem tay `a_fp_review.csv`).")
    if b and b.get("full"):
        fb = b["full"]
        extra = ""
        if b.get("first_sentence"):
            extra = (f" Chỉ dùng câu đầu: MRR {_f(b['first_sentence']['MRR'])} (vs {_f(fb['MRR'])}) → "
                     "mô tả càng chi tiết càng dễ tìm.")
        out.append(f"- **(b) Gõ câu mô tả dài** (mỗi câu chỉ đúng 1 ảnh trong 5.000): ảnh đúng đứng đầu "
                   f"**{_pct(fb['R@1'])}** số lần, lọt top 10 **{_pct(fb['R@10'])}**, MRR {_f(fb['MRR'])}.{extra}")
    if c:
        judged = c.get("en@app", {}).get("judged_fraction") or 0
        if judged < 1:
            out.append(f"- **(c) Query ghép** (vd \"chó trên bãi biển\"): **chưa có số** — mới chấm tay "
                       f"{judged:.0%}, còn {c.get('unjudged_pairs', '?')} cặp (mở `judge.html`).")
        else:
            en, vi, ml = c.get("en@app") or {}, c.get("vi@app") or {}, c.get("vi@multilingual") or {}
            out.append(f"- **(c) Query ghép** (vd \"dog on a beach\", 40 query, chấm tay top 20): trung bình "
                       f"**{10 * en.get('P@10', 0):.1f}/10** ảnh đầu là đúng (P@10 {_f(en.get('P@10'))}, "
                       f"nDCG@10 {_f(en.get('nDCG@10'))}). Khó hơn hẳn gõ 1 tên lớp ({_f(a['known_all']['P@10']) if a else '?'}) "
                       "vì phải đúng *cả hai* ý cùng lúc.")
            if vi:
                line = (f"- **Cùng query bằng tiếng Việt**: CLIP của app chỉ được **{_f(vi.get('P@10'))}** "
                        "(gần như đoán bừa — model chỉ học tiếng Anh)")
                if ml:
                    line += (f"; đổi sang CLIP đa ngữ lên **{_f(ml.get('P@10'))}** ≈ tiếng Anh → muốn tìm bằng "
                             "tiếng Việt phải dùng CLIP đa ngữ (hoặc dịch query sang tiếng Anh trước)")
                out.append(line + ".")
    out.append("- **(d) Tiếng Việt**: " + ("đã chạy — xem REPORT.md." if r.get("d_vietnamese") else "tạm hoãn."))
    return out


def text_e4(r: dict | None) -> list[str]:
    out = ["## E4 — YOLO26 tốt đến đâu?"]
    if not r:
        return out + ["Chưa chạy."]
    tags = {x["thresholds"]: x for x in r["test_tag"]}
    tuned, app = tags.get("tuned_on_val", {}), tags.get("app_conf_0.25", {})
    total = r["covered_classes"] + r["gap_classes"]
    out += [f"- YOLO chỉ biết **{r['covered_classes']}/{total}** lớp — {r['gap_classes']} lớp còn lại (cảnh, hoa, "
            "toà nhà, món ăn ngoài COCO…) chỉ CLIP lấp được.",
            f"- Tìm + vẽ khung: mAP@0.5 **{_f(r['test_detection_mAP50'])}** (đồ vật nhỏ / bị che như dao, nĩa, sách "
            "thường kém — xem REPORT.md).",
            f"- Dùng làm tag: mAP **{_f(tuned.get('mAP'))}** · ngưỡng chọn trên val macro-F1 **{_f(tuned.get('macro_f1'))}**"
            f" vs ngưỡng mặc định app (0.25) {_f(app.get('macro_f1'))}"]
    if tuned and app and tuned["macro_f1"] > app["macro_f1"]:
        out.append("**Nghĩa là:** ngưỡng riêng từng lớp tốt hơn ngưỡng chung của app → gợi ý chỉnh `AI_YOLO_CONF` "
                   "/ dùng ngưỡng theo lớp.")
    return out


def text_e5(r: dict | None) -> list[str]:
    out = ["## E5 — Gộp YOLO + CLIP có tốt hơn? (RQ2 · kết quả chính C1)",
           "_Mỗi tag thử 4 cách — chỉ CLIP, chỉ YOLO, OR (1 trong 2 nói có), AND (cả 2 cùng nói có) — chọn cách "
           f"F1 cao nhất trên val mà vẫn giữ precision ≥ {r['precision_target'] if r else 0.9:.0%}._"]
    if not r:
        return out + ["Chưa chạy."]
    h, ci = r["test_all_classes"], r.get("paired_ci95", {})
    get = lambda k: h.get(k, {}).get("macro_f1")  # noqa: E731
    out += [f"- macro-F1 (cả {sum(int(x['classes']) for x in r['rule_choice'])} lớp): chỉ YOLO **{_f(get('yolo_only'))}** · "
            f"chỉ CLIP **{_f(get('clip_only'))}** · vật thể→YOLO/cảnh→CLIP **{_f(get('group_baseline'))}** · "
            f"**gộp theo tag {_f(get('per_tag'))}** · luôn OR {_f(get('or'))}",
            f"- Gộp theo tag vs chỉ CLIP: {_sf(ci.get('per_tag_minus_clip_macro_f1_lo'))} … "
            f"{_sf(ci.get('per_tag_minus_clip_macro_f1_hi'))} → "
            f"{_ci_sig(ci.get('per_tag_minus_clip_macro_f1_lo'), ci.get('per_tag_minus_clip_macro_f1_hi'))}",
            f"- Gộp theo tag vs chỉ YOLO (lớp YOLO biết): {_sf(ci.get('per_tag_minus_yolo_macro_f1_covered_lo'))} … "
            f"{_sf(ci.get('per_tag_minus_yolo_macro_f1_covered_hi'))} → "
            f"{_ci_sig(ci.get('per_tag_minus_yolo_macro_f1_covered_lo'), ci.get('per_tag_minus_yolo_macro_f1_covered_hi'))}"]
    cov = next((x for x in r["rule_choice"] if x["group"] == "object" and x["yolo_covered"] in (True, "True")), None)
    if cov:
        counts = {k: int(cov[k]) for k in ("or", "clip", "yolo", "and")}
        top = max(counts, key=counts.get)
        out.append(f"- Lớp YOLO biết ({cov['classes']}): chọn " +
                   ", ".join(f"{k.upper()} {v}" for k, v in sorted(counts.items(), key=lambda x: -x[1])) +
                   f" → **{top.upper()}** thắng nhiều nhất; lớp YOLO không biết luôn dùng CLIP.")
    note = ""
    if get("or") is not None and get("per_tag") is not None and get("or") >= get("per_tag") - 0.005:
        note = (" Lưu ý trung thực: chỉ cần **luôn OR** cũng đạt ngang chọn theo tag → giá trị nằm ở *việc gộp* hai "
                "nguồn, chọn quy tắc riêng từng tag chưa thêm lợi ích rõ.")
    out.append(f"**Nghĩa là:** gộp hai model tốt hơn rõ rệt so với dùng riêng từng model.{note} F1 ở đây thấp hơn E2 "
               "vì bắt precision ≥ 90% (ưu tiên ít gắn sai hơn gắn đủ — hợp lý cho app).")
    return out


def _mode_vi(mode: str) -> str:
    return {"boost": "cộng điểm", "boost_prob": "cộng điểm (xác suất)", "filter": "lọc"}.get(mode, mode)


def text_yolo_ft(r: dict | None) -> list[str]:
    out = ["## YOLO-FT — Fine-tune YOLO trên Open Images lấp được khoảng trống không?",
           "_YOLO26n (pretrain COCO, 81 lớp) được train tiếp trên box của 15.000 ảnh train cho 128 lớp vật thể; "
           "chọn epoch trên val, đo test 1 lần. So với model gốc theo cùng giao thức như E4._"]
    if not r:
        return out + ["Chưa chạy."]
    u, d = r.get("ultralytics_test") or {}, r.get("oi_detection_AP50") or {}
    if u:
        out.append(f"- Ultralytics test ({r['classes']} lớp): mAP@50 **{_f(u['mAP50'])}** · mAP@50-95 **{_f(u['mAP50_95'])}** "
                   f"(lớp COCO {_f(u['mAP50_95_coco_classes'])} · lớp ngoài COCO {_f(u['mAP50_95_gap_classes'])})")
    out.append(f"- Vẽ khung AP@0.5 (giao thức OI): lớp COCO gốc **{_f(d.get('base_coco'))}** → fine-tune "
               f"**{_f(d.get('ft_coco'))}** · {r['gap_classes']} lớp ngoài COCO: 0 → **{_f(d.get('ft_gap'))}**")
    tags = {(t["model"], t["set"]): t for t in r.get("tag", [])}
    if ("ft", "gap") in tags:
        b, f, g = tags.get(("base", "coco"), {}), tags.get(("ft", "coco"), {}), tags[("ft", "gap")]
        out.append(f"- Gắn tag (lớp COCO): mAP {_f(b.get('mAP'))} → **{_f(f.get('mAP'))}** · F1@P "
                   f"{_f(b.get('macro_f1_at_precision'))} → **{_f(f.get('macro_f1_at_precision'))}**; lớp ngoài COCO: "
                   f"mAP **{_f(g['mAP'])}** · F1@P **{_f(g['macro_f1_at_precision'])}**")
    ci = r.get("paired_ci95") or {}
    lo, hi = ci.get("ft_minus_base_coco_mAP_lo"), ci.get("ft_minus_base_coco_mAP_hi")
    if lo is not None:
        out.append(f"- Fine-tune − gốc trên lớp COCO (tag mAP): {_sf(lo)} … {_sf(hi)} → {_ci_sig(lo, hi)}")
    lat = r.get("latency") or {}
    if lat:
        out.append("- Chi phí: " + " · ".join(f"{k} {v['ms_per_image']:.1f} ms/ảnh, {v['params_m']:.2f}M tham số"
                                               for k, v in lat.items()))
    forgot = lo is not None and hi < 0
    msg = ("fine-tune làm **giảm** chất lượng trên lớp COCO (quên) — cân nhắc --freeze hoặc ít epoch hơn"
           if forgot else "fine-tune mở rộng YOLO sang lớp ngoài COCO mà không làm hỏng lớp cũ")
    return out + [f"**Nghĩa là:** {msg}."]


def text_probe(r: dict | None) -> list[str]:
    out = ["## Probe — Tag có train (linear probe) tốt hơn zero-shot bao nhiêu?",
           "_Học 1 lớp tuyến tính trên feature app đã lưu (CLIP, DINOv3, YOLO) bằng 15.000 ảnh train; chọn siêu tham "
           "số / ngưỡng trên val, báo cáo test 1 lần. Hai mốc không train (zero-shot E2, quy tắc E5) đo cùng cách._"]
    if not r:
        return out + ["Chưa chạy."]
    h, ci = r["test_all_classes"], r.get("paired_ci95", {})
    names = {"zs_clip": "CLIP zero-shot (E2)", "e5_per_tag": "quy tắc chọn tay (E5)", "lp_clip": "probe CLIP",
             "lp_dino": "probe DINO", "lp_clip_dino": "probe CLIP+DINO", "fused_learned": "fusion có học CLIP+DINO+YOLO"}
    for n, x in h.items():
        out.append(f"- {names.get(n, n)}: mAP **{_f(x['mAP'])}** · macro-F1 {_f(x['macro_f1'])} · "
                   f"macro-F1 @precision ≥ {r.get('precision_target', 0.9):.0%} **{_f(x['macro_f1_at_precision'])}** · "
                   f"ECE {_f(x['ece'])}")
    sig = []
    for pair, label in PROBE_LADDER_LABELS.items():
        a, b = pair.split("-", 1)
        lo, hi = ci.get(f"{a}_minus_{b}_mAP_lo"), ci.get(f"{a}_minus_{b}_mAP_hi")
        if lo is None:
            continue
        out.append(f"- {label}: Δ mAP {_sf(lo)} … {_sf(hi)} → {_ci_sig(lo, hi)}")
        sig.append((pair, lo, hi))
    edges = {n: v["grid_edge"] for n, v in (r.get("selected") or {}).items() if v.get("grid_edge")}
    if edges:
        out.append(f"- ⚠️ siêu tham số nằm ở biên lưới: {edges} — mở rộng lưới rồi chạy lại.")
    good = [p for p, lo, _ in sig if lo > 0]
    msg = ("train giúp rõ ở: " + ", ".join(PROBE_LADDER_LABELS[p] for p in good)) if good else \
        "chưa thấy bậc nào tốt hơn chắc chắn"
    return out + [f"**Nghĩa là:** {msg}."]


def _ceiling(row: dict) -> bool:
    """Dòng E6 là mốc trần (nhãn thật), không phải model."""
    from experiments.e6_hybrid import CEILING_SOURCES

    return row.get("source") in CEILING_SOURCES


def text_e6(r: dict | None) -> list[str]:
    out = ["## E6 — Tag có giúp tìm kiếm không? (RQ2)",
           "_Khi câu tìm kiếm nhắc tới 1 lớp: **lọc cứng** (chỉ giữ ảnh có tag) hoặc **cộng điểm nhẹ** "
           "(ảnh có tag được cộng thêm chút điểm)._"]
    if not r or not r.get("captions"):
        return out + ["Chưa chạy."]
    all_rows = r["captions"]["rows"]
    rows = [x for x in all_rows if not _ceiling(x)]
    base = next(x for x in rows if x["mode"] == "clip")
    for mode, label in (("boost", "Cộng điểm"), ("boost_prob", "Cộng điểm theo xác suất"), ("filter", "Lọc cứng")):
        for x in (y for y in rows if y["mode"] == mode):
            out.append(f"- {label} bằng tag **{x['source']}**: MRR {_f(base['MRR'])} → **{_f(x['MRR'])}** → "
                       f"{_ci_sig(x.get('dMRR_ci_lo'), x.get('dMRR_ci_hi'))}")
    oracle = next((x for x in all_rows if _ceiling(x) and x["mode"] == "boost"), None)
    if oracle:
        best = max((x for x in rows if x["mode"].startswith("boost")), key=lambda x: x["MRR"], default=None)
        lab = r.get("oracle_named_pairs") or {}
        room = oracle["MRR"] - base["MRR"]
        got = (best["MRR"] - base["MRR"]) / room if best and room > 1e-9 else None
        out.append(f"- **Trần (tag hoàn hảo = nhãn thật, cộng điểm)**: MRR {_f(base['MRR'])} → **{_f(oracle['MRR'])}** "
                   f"(+{room:.3f})" + (f" · nguồn tốt nhất ({best['mode']} {best['source']}) đã lấy được **{got:.0%}** khoảng cách tới trần"
                                       if got is not None else "")
                   + (f" · lớp caption nhắc tới: ảnh đích positive {lab['positive']:.0%}, chưa xác minh "
                      f"{lab['unknown']:.0%} (trần thật cao hơn chút)" if lab else ""))
    boosts = [x for x in rows if x["mode"].startswith("boost") and (x.get("dMRR_ci_lo") or 0) > 0]
    filters_bad = all((x.get("dMRR_ci_hi") or 0) < 0 for x in rows if x["mode"] == "filter")
    msg = ("tag giúp search **một chút** khi dùng để cộng điểm" if boosts else "tag chưa giúp search rõ")
    if filters_bad:
        msg += "; lọc cứng luôn làm tệ hơn (tag sai một lần là ảnh đúng bị loại hẳn) → dùng tag để *ưu tiên*, không để *lọc*"
    comp = r.get("compositional")
    if comp and comp.get("unjudged_pairs"):
        msg += f". Query ghép chưa có số (còn {comp['unjudged_pairs']} cặp chưa chấm)"
    elif comp:
        crow = [x for x in comp["rows"] if not _ceiling(x)]
        cbase = next(x for x in crow if x["mode"] == "clip")
        out.append(f"- **Query ghép** (40 query, chấm tay, P@10 — CLIP thuần **{_f(cbase['P@10'])}**): " + " · ".join(
            f"{_mode_vi(x['mode'])} {x['source']} {_f(x['P@10'])}"
            for x in crow if x["mode"] != "clip"))
        best = max(crow, key=lambda x: x["P@10"])
        gain = best["P@10"] - cbase["P@10"]
        msg += (f". Với query ghép, tốt nhất là {_mode_vi(best['mode'])} bằng tag "
                f"{best['source']} (+{gain:.3f} P@10 ≈ {gain * 400:.0f} ảnh đúng thêm trên 400 ô top-10) — "
                "chênh nhỏ và chỉ có 40 query nên coi là *xu hướng*, chưa phải kết luận chắc; tag CLIP lọc cứng "
                "vẫn làm tệ hơn, khớp với kết quả caption") if best["mode"] != "clip" else \
               ". Với query ghép, tag không cải thiện so với CLIP thuần"
    for key, label, metric in (("captions", "caption", "MRR"), ("compositional", "query ghép", "P@10")):
        pw = ((r.get(key) or {}).get("pairwise")) or []
        if key == "compositional" and comp and comp.get("unjudged_pairs"):
            continue
        for x in pw:
            out.append(f"- So sánh ({label}, {metric}): `{x['a']}` {_f(x['a_mean'])} vs `{x['b']}` {_f(x['b_mean'])} "
                       f"→ Δ {_sf(x['diff'])} ({_sf(x.get('diff_ci_lo'))} … {_sf(x.get('diff_ci_hi'))}) → "
                       f"{_ci_sig(x.get('diff_ci_lo'), x.get('diff_ci_hi'))}")
    return out + [f"**Nghĩa là:** {msg}."]


# ── version + ghi file ────────────────────────────────────────────────────
def _index_path(root: Path) -> Path:
    return history_dir(root, "summary") / "index.csv"


def _read_index(root: Path) -> list[dict]:
    path = _index_path(root)
    if not path.exists():
        return []
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def _delta_table(metrics: dict, prev: dict | None) -> str:
    lines = ["| metric | trước | bây giờ | thay đổi |", "|---|---|---|---|"]
    for k, v in metrics.items():
        if isinstance(v, str):
            continue
        old = prev.get(k) if prev else None
        try:
            old_f = float(old) if old not in (None, "") else None
        except ValueError:
            old_f = None
        if old_f is None:
            change = "mới"
        else:
            d = float(v) - old_f
            change = "=" if abs(d) < 5e-4 else (f"▲ +{d:.3f}" if d > 0 else f"▼ {d:.3f}")
        lines.append(f"| {k} | {_f(old_f) if old_f is not None else '–'} | {_f(v)} | {change} |")
    return "\n".join(lines)


def update_summary(data_root: Path, trigger: str = "manual") -> Path:
    root = Path(data_root)
    res, runs = {}, {}
    for e in EXPS:
        res[e], runs[e] = _load(root, e)
    metrics = key_metrics(res)
    index = _read_index(root)
    prev = index[-1] if index else None
    changed = prev is None or any(str(metrics.get(k)) != (prev.get(k) or "") for k in metrics) \
        or any(k not in metrics for k, v in (prev or {}).items() if k.startswith("E") and v not in (None, ""))
    version = (int(prev["version"][1:]) + (1 if changed else 0)) if prev else 1
    vname = f"v{version:03d}"
    now = datetime.now()

    body = [
        f"# Tóm tắt thực nghiệm AI — {vname}",
        f"Cập nhật {now:%Y-%m-%d %H:%M} · kích hoạt bởi `{trigger}` · dữ liệu `{data_fingerprint(root)}`",
        "_File tự sinh sau mỗi run chính thức E1–E6. Bảng đầy đủ: `REPORT.md` (vi) / `REPORT.en.md` (en). "
        "Các version cũ: `History/summary/`._",
        "**Đọc số:** precision = trong ảnh model gắn tag, bao nhiêu % đúng · recall = tìm ra bao nhiêu % ảnh đúng · "
        "F1 = cân bằng hai cái · mAP = ảnh đúng có xếp ở đầu không · ECE = độ tin cậy có khớp thực tế không "
        "(gần 0 tốt) · R@10 = ảnh đúng có trong top 10 · MRR = ảnh đúng thường đứng thứ mấy (1 = luôn đầu). "
        "Tất cả 0–1, càng cao càng tốt (trừ ECE).",
        "**Dữ liệu:** Open Images V7, 174 lớp (128 vật thể + 46 cảnh); val 3.000 ảnh để *chọn* prompt/ngưỡng/quy "
        "tắc, test 5.000 ảnh để *báo cáo* 1 lần; nhãn do người kiểm tra, cặp chưa kiểm tra bị bỏ khỏi phép tính.",
        f"## Thay đổi so với {prev['version'] if prev and changed else 'version trước'}"
        if prev else "## Metric chính (version đầu tiên)",
        _delta_table(metrics, prev if changed else (index[-2] if len(index) >= 2 else None)),
        "## Kết luận nhanh",
        _conclusions(res),
    ]
    for fn, e in ((text_e1, "e1"), (text_e2, "e2"), (text_e3, "e3"), (text_e4, "e4"), (text_yolo_ft, "yolo_ft"), (text_e5, "e5"),
                  (text_probe, "probe"), (text_e6, "e6")):
        section = fn(res[e])
        if runs[e]:
            section.insert(1, f"<sub>run `{runs[e]}`</sub>")
        body.append("\n\n".join(section))
    history = index + ([{"version": vname, "updated": f"{now:%Y-%m-%d %H:%M}", "trigger": trigger, **metrics}] if changed else [])
    body += ["## Lịch sử version", _history_table(history)]
    text = "\n\n".join(body) + "\n"

    out = result_root(root) / "SUMMARY.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    if changed:
        snap = history_dir(root, "summary") / f"SUMMARY_{vname}.md"
        snap.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out, snap)
        write_csv(_index_path(root), history)
    return out


def _conclusions(res: dict) -> str:
    items = []
    e2, e5, e6 = res.get("e2"), res.get("e5"), res.get("e6")
    if res.get("e1"):
        items.append("Pipeline CLIP: " + ("✅ khớp paper" if res["e1"].get("all_pass") else
                                          "phần ảnh đúng, phần chữ lệch nhẹ so với paper"))
    if e2:
        items.append(f"CLIP gắn tag: mAP {_f(e2['test']['mAP'])}, độ tin cậy sau calibrate tốt "
                     f"(ECE {_f(e2['test']['ece_calibrated'])})")
    if e5:
        h = e5["test_all_classes"]
        items.append(f"Gộp YOLO + CLIP: macro-F1 {_f(h['per_tag']['macro_f1'])} vs chỉ CLIP "
                     f"{_f(h['clip_only']['macro_f1'])} / chỉ YOLO {_f(h['yolo_only']['macro_f1'])}")
    e3c = ((res.get("e3") or {}).get("c_compositional") or {})
    if (e3c.get("en@app") or {}).get("judged_fraction", 0) >= 1:
        t = f"Query ghép: P@10 {_f(e3c['en@app']['P@10'])} (tiếng Anh)"
        if e3c.get("vi@app"):
            t += f"; tiếng Việt cần CLIP đa ngữ ({_f(e3c['vi@app']['P@10'])} → {_f((e3c.get('vi@multilingual') or {}).get('P@10'))})"
        items.append(t)
    pr = (res.get("probe") or {}).get("test_all_classes") or {}
    if pr:
        best = max((n for n in pr if n not in ("zs_clip", "e5_per_tag")), key=lambda n: pr[n]["mAP"], default=None)
        if best:
            items.append(f"Tag có train: mAP zero-shot {_f((pr.get('zs_clip') or {}).get('mAP'))} → {best} "
                         f"{_f(pr[best]['mAP'])}")
    if e6 and e6.get("captions"):
        items.append("Tag cho search: chỉ nên cộng điểm nhẹ, không lọc cứng")
    return "\n".join(f"{i}. {t}" for i, t in enumerate(items, 1)) or "Chưa có run nào."


def _history_table(rows: list[dict]) -> str:
    if not rows:
        return "_Chưa có._"
    keys = [k for k in ("E2 tag CLIP mAP", "E3a tìm theo tên lớp mAP", "E4 YOLO vẽ khung mAP@0.5",
                        "E5 macro-F1 gộp theo tag", "E6 MRR boost tốt nhất", "E3c query ghép P@10 (tiếng Anh)") if any(k in r for r in rows)]
    lines = ["| version | lúc | kích hoạt bởi | " + " | ".join(keys) + " |", "|---" * (3 + len(keys)) + "|"]
    for r in rows[::-1]:
        lines.append(f"| {r['version']} | {str(r['updated'])[:16].replace('T', ' ')} | {r.get('trigger', '')} | "
                     + " | ".join(_f(r.get(k)) for k in keys) + " |")
    return "\n".join(lines)


def run(p: SummaryParams) -> dict:
    out = update_summary(p.root, "manual")
    print(f"→ {out}")
    return {"summary": str(out)}
