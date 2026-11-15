"""Probe — tag CÓ TRAIN: linear probe trên feature app đã lưu (bản train của E2 / E5, nguồn tag mới cho E6).

Cấu hình (feature → 1 lớp tuyến tính, 174 đầu ra):
  lp_clip        CLIP của app (512)                — chỉ khác E2 ở chỗ HỌC từ nhãn → "tác dụng của việc train"
  lp_dino        DINOv3 ViT-S/16 (384)             — feature độc lập với CLIP search
  lp_clip_dino   CLIP ⊕ DINO
  fused_learned  CLIP ⊕ DINO ⊕ YOLO (80 lớp × [log1p số box, conf lớn nhất, diện tích lớn nhất])
                 = fusion CÓ HỌC, thay cho quy tắc chọn tay của E5 (clip / yolo / or / and)

Dữ liệu: TRAIN (`select --splits train` + `build --splits train`) để học trọng số; VAL để chọn
(L2, trọng số cặp chưa xác minh), ngưỡng và calibrator; TEST chạy 1 lần để báo cáo.

Huấn luyện: BCE có trọng số, full-batch L-BFGS (torch, CPU, khởi tạo 0 → tái lập được), feature
chuẩn hoá theo train. Cặp (ảnh, lớp) chưa xác minh (−1) có nhãn 0 với trọng số `unknown_weight`
(0 = bỏ hẳn; >0 = coi là negative yếu — Open Images thiếu nhãn nên đây là siêu tham số, chọn trên val).
Loss từng lớp lấy trung bình theo trọng số rồi cộng 174 lớp + l2·‖W‖².

Đánh giá trên test, cùng một thủ tục cho mọi hàng (kể cả 2 mốc không train lấy từ run có sẵn):
  zs_clip        điểm CLIP zero-shot của E2
  e5_per_tag     xác suất gộp theo quy tắc từng tag của E5
  → mAP · macro-F1 @ngưỡng max-F1 (so được với E2) · macro-F1 @precision ≥ target (so được với E5) · ECE.
Bootstrap ghép cặp (ảnh test) cho từng bậc thang: lp_clip − zs_clip, fused_learned − lp_clip, …

Artifacts: decisions.npz (tag 0/1 @precision target + xác suất, val/test) → `e6 --sources lp_clip …`;
probes.npz (W, b, mean, std của từng cấu hình) để sau này đưa vào app.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from experiments import metrics as M
from experiments.core import CommonParams, Run, find_run, opt
from experiments.features import (
    APP_CLIP,
    APP_DINO,
    APP_YOLO,
    clip_image_features,
    dino_image_features,
    yolo_detections,
    yolo_feature_matrix,
    yolo_names,
)
from experiments.oi_data import load_subset

CONFIGS = {  # tên → các khối feature
    "lp_clip": ("clip",),
    "lp_dino": ("dino",),
    "lp_clip_dino": ("clip", "dino"),
    "fused_learned": ("clip", "dino", "yolo"),
}
BASELINES = ("zs_clip", "e5_per_tag")  # mốc không train (đọc từ run E2 / E5)
DEFAULT_LADDER = ["lp_clip-zs_clip", "lp_dino-lp_clip", "fused_learned-lp_clip", "fused_learned-e5_per_tag"]


@dataclass
class ProbeParams(CommonParams):
    configs: list[str] = opt(list(CONFIGS), "Cấu hình probe.", choices=list(CONFIGS))
    clip: str = opt(APP_CLIP, "CLIP của app.")
    dino: str = opt(APP_DINO, "DINOv3 (thư mục trong ai-service/models/).")
    yolo: str = opt(APP_YOLO, "YOLO (cùng cache detection với E4: conf 0.001, imgsz 640).")
    preprocess: str = opt("backend", "Tiền xử lý ảnh.", choices=["backend", "raw"])
    l2: list[float] = opt([1e-4, 1e-3, 1e-2, 1e-1], "Lưới hệ số L2 (chọn trên val mAP).")
    unknown_weight: list[float] = opt([0.0, 0.1, 1.0], "Lưới trọng số cặp chưa xác minh (nhãn 0).")
    max_iter: int = opt(300, "Số vòng L-BFGS.")
    precision_target: float = opt(0.9, "Precision tối thiểu khi chọn ngưỡng tag (= E5).")
    calib_min_count: int = opt(10, "Isotonic riêng cho lớp có ≥ N pos và N neg trên val.")
    ladder: list[str] = opt(DEFAULT_LADDER, "Cặp 'a-b' cần CI bootstrap ghép cặp (a − b trên test).")
    e2_run: str = opt("", "Run E2 cho mốc zs_clip (trống = latest).")
    e5_run: str = opt("", "Run E5 cho mốc e5_per_tag (trống = latest).")
    bootstrap: int = opt(300, "Bootstrap ghép cặp (0 = tắt).")
    batch_size: int = opt(64, "Batch encode ảnh.")


# ── huấn luyện ────────────────────────────────────────────────────────────
def train_probe(X: np.ndarray, Y: np.ndarray, l2: float, unknown_weight: float, max_iter: int = 300) -> dict:
    """Probe tuyến tính multi-label, BCE có mask. X đã chuẩn hoá. → {W (D, C), b (C,)}."""
    import torch

    torch.manual_seed(0)
    Xt = torch.from_numpy(np.ascontiguousarray(X, dtype=np.float32))
    T = torch.from_numpy((Y == 1).astype(np.float32))
    Wt = torch.from_numpy(np.where(Y == -1, unknown_weight, 1.0).astype(np.float32))
    denom = Wt.sum(0).clamp(min=1.0)
    pos = (T * Wt).sum(0)
    prior = ((pos + 1) / (denom + 2)).clamp(1e-4, 1 - 1e-4)
    W = torch.zeros(X.shape[1], Y.shape[1], requires_grad=True)
    b = torch.log(prior / (1 - prior)).clone().requires_grad_(True)
    opt_ = torch.optim.LBFGS([W, b], lr=1.0, max_iter=max_iter, history_size=20, line_search_fn="strong_wolfe")

    def closure():
        opt_.zero_grad()
        loss = torch.nn.functional.binary_cross_entropy_with_logits(Xt @ W + b, T, reduction="none")
        total = ((loss * Wt).sum(0) / denom).sum() + l2 * (W ** 2).sum()
        total.backward()
        return total

    opt_.step(closure)
    return {"W": W.detach().numpy().astype(np.float32), "b": b.detach().numpy().astype(np.float32)}


def standardize(train: np.ndarray, *others: np.ndarray):
    mean, std = train.mean(0), train.std(0) + 1e-6
    return mean, std, [(a - mean) / std for a in (train, *others)]


# ── đánh giá chung ────────────────────────────────────────────────────────
def fit_eval(name: str, Sv: np.ndarray, St: np.ndarray, Yv: np.ndarray, precision_target: float,
             min_count: int) -> dict:
    """Ngưỡng + calibrator chọn trên val, rồi đo test. Cùng thủ tục cho probe và mốc không train."""
    C = Yv.shape[1]
    free, strict = np.full(C, np.inf), np.full(C, np.inf)
    for c in range(C):
        m = M.known(Yv, c)
        free[c] = M.tune_threshold(Sv[m, c], Yv[m, c] == 1)["threshold"]
        strict[c] = M.tune_threshold(Sv[m, c], Yv[m, c] == 1, precision_target)["threshold"]
    cals = M.fit_calibrators(Sv, Yv, free, min_count)
    return {"name": name, "S_val": Sv, "S_test": St, "thr_free": free, "thr_strict": strict,
            "P_val": M.apply_calibrators(Sv, cals), "P_test": M.apply_calibrators(St, cals)}


def eval_rows(r: dict, Yt: np.ndarray, sets: dict[str, list[int]]) -> list[dict]:
    rows = []
    for set_name, cols in sets.items():
        if not cols:
            continue
        a = M.multilabel_summary(r["S_test"], Yt, r["thr_free"], r["P_test"], cols)
        s = M.multilabel_summary(r["S_test"], Yt, r["thr_strict"], cols=cols)
        rows.append({"config": r["name"], "classes_set": set_name, "classes": a["classes"], "mAP": a["mAP"],
                     "macro_f1": a["macro_f1"], "micro_f1": a["micro_f1"], "ece": a.get("ece"),
                     "macro_f1_at_precision": s["macro_f1"], "micro_precision_at_precision": s["micro_precision"]})
    return rows


def run(p: ProbeParams) -> dict:
    with Run("probe", p) as run:
        run.stage("load subset")
        tr = load_subset(p.root, "train", p.smoke)
        val, test = load_subset(p.root, "validation", p.smoke), load_subset(p.root, "test", p.smoke)
        classes, C = val.classes, len(val.classes)
        run.log(f"  train {len(tr.image_ids)} · val {len(val.image_ids)} · test {len(test.image_ids)} ảnh · {C} lớp · "
                f"train: {int((tr.Y != -1).sum()):,} cặp đã xác minh ({int((tr.Y == 1).sum()):,} positive)")
        splits = {"train": tr, "val": val, "test": test}

        need = {k for cfg in p.configs for k in CONFIGS[cfg]}
        feats: dict[str, dict[str, np.ndarray]] = {k: {} for k in need}
        for sp, sub in splits.items():
            if "clip" in need:
                run.stage(f"CLIP {sp}")
                feats["clip"][sp] = clip_image_features(sub.name, sub.image_ids, sub.paths(), p.root, p.clip,
                                                        p.preprocess, p.device, p.batch_size, run=run)
            if "dino" in need:
                run.stage(f"DINOv3 {sp}")
                feats["dino"][sp] = dino_image_features(sub.name, sub.image_ids, sub.paths(), p.root, p.dino,
                                                        p.preprocess, p.device, max(p.batch_size // 2, 8), run=run)
            if "yolo" in need:
                run.stage(f"YOLO {sp}")
                dets = yolo_detections(sub.name, sub.image_ids, sub.paths(), p.root, p.yolo, 0.001, 640,
                                       p.preprocess, p.device, run=run)
                feats["yolo"][sp] = yolo_feature_matrix(dets, sub.image_ids, yolo_names(p.yolo, p.device))

        results, grid_rows, probes = {}, [], {}
        for cfg in p.configs:
            run.stage(f"train {cfg}")
            raw = {sp: np.concatenate([feats[k][sp] for k in CONFIGS[cfg]], axis=1) for sp in splits}
            mean, std, (Xtr, Xv, Xt) = standardize(raw["train"], raw["val"], raw["test"])
            best = None
            for l2 in p.l2:
                for uw in p.unknown_weight:
                    pr = train_probe(Xtr, tr.Y, l2, uw, p.max_iter)
                    v_map = M.nanmean(M.per_class_ap(Xv @ pr["W"] + pr["b"], val.Y))
                    grid_rows.append({"config": cfg, "l2": l2, "unknown_weight": uw, "val_mAP": v_map})
                    run.log(f"  {cfg}: l2 {l2:g} · unknown_weight {uw:g} → val mAP {v_map:.4f}")
                    if best is None or v_map > best[0]:
                        best = (v_map, l2, uw, pr)
            v_map, l2, uw, pr = best
            # unknown_weight = 0 là giới hạn tự nhiên (không thể âm) → không tính là biên lưới
            edge = [n for n, v, grid in (("l2", l2, p.l2), ("unknown_weight", uw, p.unknown_weight))
                    if len(grid) > 1 and v in (min(grid), max(grid)) and not (n == "unknown_weight" and v == 0)]
            run.log(f"  → {cfg}: l2 {l2:g}, unknown_weight {uw:g} (val mAP {v_map:.4f})"
                    + (f" · ! nằm ở biên lưới {edge} — cân nhắc mở rộng lưới" if edge else ""))
            results[cfg] = fit_eval(cfg, Xv @ pr["W"] + pr["b"], Xt @ pr["W"] + pr["b"], val.Y,
                                    p.precision_target, p.calib_min_count)
            results[cfg].update({"l2": l2, "unknown_weight": uw, "val_mAP": v_map, "grid_edge": edge,
                                 "dim": Xtr.shape[1]})
            probes.update({f"{cfg}_W": pr["W"], f"{cfg}_b": pr["b"], f"{cfg}_mean": mean.astype(np.float32),
                           f"{cfg}_std": std.astype(np.float32)})
        run.table("grid_val", grid_rows)

        run.stage("mốc không train (E2 zero-shot, E5 quy tắc)")
        baselines = {}
        for name, exp, run_id, key in (("zs_clip", "e2", p.e2_run, "S"), ("e5_per_tag", "e5", p.e5_run, "fused_prob")):
            try:
                d = find_run(p.root, exp, run_id, run.smoke)
            except SystemExit:
                run.log(f"  ! chưa có run {exp} — bỏ mốc {name}")
                continue
            data = dict(np.load(d / "artifacts" / ("scores.npz" if exp == "e2" else "decisions.npz"),
                                allow_pickle=False))
            if list(data["ids_val"]) != val.image_ids or list(data["ids_test"]) != test.image_ids:
                run.log(f"  ! {exp} {d.name} chạy trên tập ảnh khác — bỏ mốc {name}")
                continue
            sv, st = data[f"{key}_val"], data[f"{key}_test"]
            results[name] = fit_eval(name, sv, st, val.Y, p.precision_target, p.calib_min_count)
            baselines[name] = d.name

        run.stage("đánh giá test")
        covered = [j for j, c in enumerate(classes) if c.get("coco")]
        sets = {"all": list(range(C)), "object": val.group_cols("object"), "scene": val.group_cols("scene"),
                "yolo_covered": covered, "yolo_gap": [j for j in range(C) if j not in set(covered)]}
        order = [n for n in (*BASELINES, *p.configs) if n in results]
        rows = [row for n in order for row in eval_rows(results[n], test.Y, sets)]
        run.table("summary", rows)
        for n in order:
            a = next(r for r in rows if r["config"] == n and r["classes_set"] == "all")
            run.log(f"  {n:14s} mAP {a['mAP']:.4f} · macro-F1 {a['macro_f1']:.4f} · "
                    f"macro-F1@P≥{p.precision_target:g} {a['macro_f1_at_precision']:.4f} · ECE {a['ece']:.4f}")

        ap = {n: M.per_class_ap(results[n]["S_test"], test.Y) for n in order}
        run.table("per_class", [
            {"class": c["oi_name"], "group": c["group"], "coco": c.get("coco", ""),
             "train_pos": int((tr.Y[:, j] == 1).sum()), "test_pos": int((test.Y[:, j] == 1).sum()),
             **{f"{n}_AP": ap[n][j] for n in order}} for j, c in enumerate(classes)])

        ci = {}
        pairs = [tuple(x.split("-", 1)) for x in p.ladder]
        pairs = [(a, b) for a, b in pairs if a in results and b in results]
        if p.bootstrap and pairs:
            run.stage(f"bootstrap ghép cặp {p.bootstrap}×")

            def diff(idx):
                out, cache = {}, {}
                for n in {x for pr_ in pairs for x in pr_}:
                    r = results[n]
                    a = M.multilabel_summary(r["S_test"][idx], test.Y[idx], r["thr_free"])
                    s = M.multilabel_summary(r["S_test"][idx], test.Y[idx], r["thr_strict"])
                    cache[n] = (a["mAP"], a["macro_f1"], s["macro_f1"])
                for a, b in pairs:
                    for k, name in enumerate(("mAP", "macro_f1", "macro_f1_at_precision")):
                        out[f"{a}_minus_{b}_{name}"] = cache[a][k] - cache[b][k]
                return out

            ci = M.bootstrap_ci(diff, len(test.image_ids), p.bootstrap)

        run.stage("artifacts cho E6")
        dec = {"ids_val": np.array(val.image_ids), "ids_test": np.array(test.image_ids)}
        for n in p.configs:
            r = results[n]
            for sp, key in (("val", "val"), ("test", "test")):
                dec[f"{n}_{sp}"] = (r[f"S_{key}"] >= r["thr_strict"]).astype(np.uint8)
                dec[f"{n}_prob_{sp}"] = r[f"P_{key}"].astype(np.float32)
        run.save_artifact("decisions.npz", dec)
        run.save_artifact("probes.npz", probes)
        run.save_artifact("probes.json", {
            "classes": [c["oi_name"] for c in classes], "precision_target": p.precision_target,
            "configs": {n: {"features": list(CONFIGS[n]), "dim": results[n]["dim"], "l2": results[n]["l2"],
                            "unknown_weight": results[n]["unknown_weight"],
                            "thresholds_strict": [float(t) if np.isfinite(t) else None for t in results[n]["thr_strict"]]}
                        for n in p.configs},
            "clip": p.clip, "dino": p.dino, "yolo": p.yolo, "preprocess": p.preprocess})

        headline = {r["config"]: {k: r[k] for k in ("mAP", "macro_f1", "macro_f1_at_precision", "ece")}
                    for r in rows if r["classes_set"] == "all"}
        run.summary = {
            "train_images": len(tr.image_ids), "baselines": baselines, "precision_target": p.precision_target,
            "selected": {n: {k: results[n][k] for k in ("l2", "unknown_weight", "val_mAP", "grid_edge")}
                         for n in p.configs},
            "test_all_classes": headline, "paired_ci95": ci,
            "groups": [r for r in rows if r["classes_set"] != "all"],
        }
    return run.summary
