"""E5 — Hợp nhất tag YOLO + CLIP theo từng tag.

Đầu vào: E2 (xác suất CLIP đã calibrate) + E4 (điểm YOLO image-level). YOLO cũng được
calibrate isotonic trên val để hai nguồn cùng thang xác suất.

Mỗi tag thử 4 quy tắc: yolo · clip · or = max(p_yolo, p_clip) · and = min(…).
Lớp không có trong YOLO chỉ có `clip`. Chọn trên val: F1 cao nhất trong các quy tắc đạt
precision ≥ precision_target (không quy tắc nào đạt → F1 cao nhất, ghi target_reached=False).

Chiến lược so trên test (mỗi chiến lược: ngưỡng/lớp chọn trên val với cùng precision target):
  clip_only · yolo_only (lớp không có trong YOLO → không bao giờ gắn) · or · and (lớp không có
  YOLO → clip) · group_baseline (object có YOLO → yolo, còn lại → clip) · per_tag (quy tắc đã chọn).
CI bootstrap ghép cặp cho chênh lệch per_tag − clip_only và per_tag − yolo_only.

Artifacts cho E6: decisions.npz (tag nhị phân val/test cho nguồn yolo / clip / fused).

`--e4-ft-run <id>` (run E4 với YOLO fine-tune, `e4 --weights models/yolo26n-oi-….pt --no-latest`):
làm lại toàn bộ thủ tục với YOLO fine-tune → thêm chiến lược yolo_only_ft / per_tag_ft, bảng
per_class_ft, CI ghép cặp ft − gốc, và nguồn `yolo_ft` / `fused_ft` trong decisions.npz cho E6.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

from experiments import metrics as M
from experiments.core import CommonParams, Run, find_run, opt
from experiments.oi_data import load_subset

RULES = ("clip", "yolo", "or", "and")


@dataclass
class E5Params(CommonParams):
    precision_target: float = opt(0.9, "Precision tối thiểu khi chọn quy tắc / ngưỡng trên val.")
    calib_min_count: int = opt(10, "Isotonic riêng cho lớp có ≥ N pos và N neg.")
    e2_run: str = opt("", "Run E2 dùng (trống = latest).")
    e4_run: str = opt("", "Run E4 dùng (trống = latest).")
    e4_ft_run: str = opt("", "Run E4 với YOLO fine-tune (trống = không so). Thêm nguồn yolo_ft / fused_ft.")
    bootstrap: int = opt(500, "Bootstrap ghép cặp (0 = tắt).")


def _load_scores(run_dir, ids_val, ids_test) -> dict:
    data = dict(np.load(run_dir / "artifacts" / "scores.npz", allow_pickle=False))
    if list(data["ids_val"]) != ids_val or list(data["ids_test"]) != ids_test:
        raise SystemExit(f"{run_dir} chạy trên tập ảnh khác subset hiện tại — chạy lại thí nghiệm đó.")
    return data


def rule_scores(rule: str, pc: np.ndarray, py: np.ndarray) -> np.ndarray:
    return {"clip": pc, "yolo": py, "or": np.maximum(pc, py), "and": np.minimum(pc, py)}[rule]


def _yolo_thresholds(e4_dir) -> np.ndarray:
    return np.array([t if t is not None else np.inf for t in
                     json.loads((e4_dir / "artifacts" / "yolo_tagger.json").read_text())["thresholds"]])


class Fusion:
    """Thủ tục E5 cho 1 bản YOLO: calibrate YOLO, chọn quy tắc từng tag trên val, dựng chiến lược."""

    def __init__(self, e4: dict, yolo_thr: np.ndarray, Pc: dict, Y: dict, classes: list[dict], p: E5Params):
        C = len(classes)
        self.covered = covered = e4["covered"].astype(bool)
        self.classes, self.Pc, self.Y = classes, Pc, Y
        self.cal = M.fit_calibrators(e4["S_val"], Y["val"], yolo_thr, p.calib_min_count)
        self.Py = Py = {"val": M.apply_calibrators(e4["S_val"], self.cal),
                        "test": M.apply_calibrators(e4["S_test"], self.cal)}
        self.thr = thr = {r: np.full(C, np.inf) for r in RULES}
        self.per_class, self.chosen = [], []
        for c, cls in enumerate(classes):
            rules = RULES if covered[c] else ("clip",)
            mv, mt = M.known(Y["val"], c), M.known(Y["test"], c)
            row = {"class": cls["oi_name"], "group": cls["group"], "coco": cls.get("coco", ""),
                   "old_tag": cls.get("old_tag", ""), "test_pos": int((Y["test"][:, c] == 1).sum())}
            best = None
            for r in rules:
                sv = rule_scores(r, Pc["val"][:, c], Py["val"][:, c])[mv]
                st = rule_scores(r, Pc["test"][:, c], Py["test"][:, c])[mt]
                t = M.tune_threshold(sv, Y["val"][mv, c] == 1, p.precision_target)
                thr[r][c] = t["threshold"]
                te = M.prf_at(st, Y["test"][mt, c] == 1, t["threshold"])
                yt = Y["test"][mt, c] == 1
                row.update({f"{r}_val_f1": t["f1"], f"{r}_val_precision": t["precision"],
                            f"{r}_reached": t["reached"], f"{r}_test_f1": te["f1"],
                            f"{r}_test_precision": te["precision"],
                            f"{r}_test_AP": M.average_precision(st, yt) if yt.any() and (~yt).any() else np.nan})
                key = (t["reached"], np.nan_to_num(t["f1"], nan=-1))
                if best is None or key > best[0]:
                    best = (key, r)
            row["selected"] = best[1]
            row["target_reached"] = bool(best[0][0])
            self.chosen.append(best[1])
            self.per_class.append(row)

    def strategy(self, name: str, split: str) -> tuple[np.ndarray, np.ndarray]:
        pc, py, covered, classes = self.Pc[split], self.Py[split], self.covered, self.classes
        S, T = np.zeros_like(pc), np.full(len(classes), np.inf)
        for c in range(len(classes)):
            if name == "per_tag":
                r = self.chosen[c]
            elif name == "group_baseline":
                r = "yolo" if covered[c] and classes[c]["group"] == "object" else "clip"
            elif name == "clip_only":
                r = "clip"
            elif name == "yolo_only":
                r = "yolo" if covered[c] else None
            else:  # or / and
                r = name if covered[c] else "clip"
            if r is None:
                continue  # không có YOLO → không bao giờ gắn tag
            S[:, c] = rule_scores(r, pc[:, c], py[:, c])
            T[c] = self.thr[r][c]
        return S, T

    def rule_choice(self) -> list[dict]:
        rows, C = [], len(self.classes)
        for gname in ("object", "scene"):
            for cov_flag in (True, False):
                idx = [c for c in range(C) if self.classes[c]["group"] == gname and self.covered[c] == cov_flag]
                if idx:
                    counts = {r: sum(self.chosen[c] == r for c in idx) for r in RULES}
                    rows.append({"group": gname, "yolo_covered": cov_flag, "classes": len(idx), **counts,
                                 "target_reached": sum(self.per_class[c]["target_reached"] for c in idx)})
        return rows

    def decisions(self, suffix: str = "") -> dict:
        dec = {}
        for split in ("val", "test"):
            sources = (("yolo", "yolo_only"), ("fused", "per_tag")) + ((("clip", "clip_only"),) if not suffix else ())
            for source, name in sources:
                S, T = self.strategy(name, split)
                dec[f"{source}{suffix}_{split}"] = (S >= T).astype(np.uint8)
            dec[f"fused{suffix}_prob_{split}"] = self.strategy("per_tag", split)[0]
            if not suffix:
                dec[f"clip_prob_{split}"] = self.Pc[split]  # xác suất đã calibrate → E6 boost_prob
            dec[f"yolo{suffix}_prob_{split}"] = np.where(self.covered, self.Py[split], 0.0)
        return dec


def run(p: E5Params) -> dict:
    with Run("e5", p) as run:
        run.stage("load E2 + E4")
        val, test = load_subset(p.root, "validation", p.smoke), load_subset(p.root, "test", p.smoke)
        classes, C = val.classes, len(val.classes)
        e2_dir = find_run(p.root, "e2", p.e2_run, run.smoke)
        e4_dir = find_run(p.root, "e4", p.e4_run, run.smoke)
        e2 = _load_scores(e2_dir, val.image_ids, test.image_ids)
        e4 = _load_scores(e4_dir, val.image_ids, test.image_ids)
        Pc = {"val": e2["P_val"], "test": e2["P_test"]}
        Y = {"val": val.Y, "test": test.Y}
        ft_dir = find_run(p.root, "e4", p.e4_ft_run, run.smoke) if p.e4_ft_run else None
        if ft_dir is not None and ft_dir == e4_dir:
            raise SystemExit("--e4-ft-run trùng --e4-run — chỉ định run E4 chạy với YOLO fine-tune.")

        run.stage("calibrate YOLO + chọn quy tắc từng tag trên val")
        base = Fusion(e4, _yolo_thresholds(e4_dir), Pc, Y, classes, p)
        covered = base.covered
        run.log(f"  E2 = {e2_dir.name} · E4 = {e4_dir.name} · {covered.sum()} lớp có YOLO")
        ft = None
        if ft_dir is not None:
            e4ft = _load_scores(ft_dir, val.image_ids, test.image_ids)
            ft = Fusion(e4ft, _yolo_thresholds(ft_dir), Pc, Y, classes, p)
            run.log(f"  E4 fine-tune = {ft_dir.name} · {ft.covered.sum()} lớp có YOLO")
        run.table("per_class", base.per_class)
        if ft:
            run.table("per_class_ft", ft.per_class)

        run.stage("so chiến lược trên test")
        strategies = ("clip_only", "yolo_only", "or", "and", "group_baseline", "per_tag")
        is_coco = np.array([bool(c.get("coco")) for c in classes])
        sets = {"all": list(range(C)), "yolo_covered": list(np.flatnonzero(covered)),
                "object": val.group_cols("object"), "scene": val.group_cols("scene"),
                "coco": list(np.flatnonzero(is_coco)), "non_coco": list(np.flatnonzero(~is_coco))}
        runs = [(n, base, n) for n in strategies]
        if ft:
            runs += [(f"{n}_ft", ft, n) for n in ("yolo_only", "or", "and", "group_baseline", "per_tag")]
        rows = []
        for label, fusion, name in runs:
            S, T = fusion.strategy(name, "test")
            for set_name, cols in sets.items():
                if cols:
                    rows.append({"strategy": label, "classes_set": set_name,
                                 **M.multilabel_summary(S, Y["test"], T, cols=cols)})
        run.table("strategies", rows)

        ci = {}
        if p.bootstrap:
            run.stage(f"bootstrap ghép cặp {p.bootstrap}×")
            mats = {n: base.strategy(n, "test") for n in ("per_tag", "clip_only", "yolo_only")}
            if ft:
                mats.update({f"{n}_ft": ft.strategy(n, "test") for n in ("per_tag", "yolo_only")})
            cov = sets["yolo_covered"]

            def summ(name, idx, cols=None):
                return M.multilabel_summary(mats[name][0][idx], Y["test"][idx], mats[name][1], cols=cols)

            def diff(idx):
                out = {}
                sel, clip = summ("per_tag", idx), summ("clip_only", idx)
                sel_c, yolo_c = summ("per_tag", idx, cov), summ("yolo_only", idx, cov)
                out["per_tag_minus_clip_macro_f1"] = sel["macro_f1"] - clip["macro_f1"]
                out["per_tag_minus_clip_mAP"] = sel["mAP"] - clip["mAP"]
                out["per_tag_minus_yolo_macro_f1_covered"] = sel_c["macro_f1"] - yolo_c["macro_f1"]
                out["per_tag_minus_yolo_mAP_covered"] = sel_c["mAP"] - yolo_c["mAP"]
                if ft:  # fine-tune − gốc: toàn bộ lớp, và riêng lớp YOLO gốc đã có (đo "quên")
                    sel_ft = summ("per_tag_ft", idx)
                    out["per_tag_ft_minus_per_tag_macro_f1"] = sel_ft["macro_f1"] - sel["macro_f1"]
                    out["per_tag_ft_minus_per_tag_mAP"] = sel_ft["mAP"] - sel["mAP"]
                    out["per_tag_ft_minus_per_tag_macro_f1_covered"] = (
                        summ("per_tag_ft", idx, cov)["macro_f1"] - sel_c["macro_f1"])
                    out["yolo_ft_minus_yolo_macro_f1_covered"] = summ("yolo_only_ft", idx, cov)["macro_f1"] - yolo_c["macro_f1"]
                    out["yolo_ft_minus_yolo_mAP_covered"] = summ("yolo_only_ft", idx, cov)["mAP"] - yolo_c["mAP"]
                return out

            ci = M.bootstrap_ci(diff, len(test.image_ids), p.bootstrap)

        choice_rows = base.rule_choice()
        run.table("rule_choice", choice_rows)
        if ft:
            run.table("rule_choice_ft", ft.rule_choice())

        run.stage("artifacts cho E6")
        dec = base.decisions()
        if ft:
            dec.update(ft.decisions("_ft"))
        dec["ids_val"], dec["ids_test"] = np.array(val.image_ids), np.array(test.image_ids)
        run.save_artifact("decisions.npz", dec)
        run.save_artifact("fusion.json", {
            "precision_target": p.precision_target, "classes": [c["oi_name"] for c in classes],
            "rules": base.chosen, "thresholds": {r: [float(t) if np.isfinite(t) else None for t in base.thr[r]] for r in RULES},
            "yolo_calibrators": base.cal, "e2_run": e2_dir.name, "e4_run": e4_dir.name,
            **({"e4_ft_run": ft_dir.name, "rules_ft": ft.chosen} if ft else {})})
        headline = {r["strategy"]: {"macro_f1": r["macro_f1"], "mAP": r["mAP"], "micro_precision": r["micro_precision"]}
                    for r in rows if r["classes_set"] == "all"}
        run.summary = {"e2_run": e2_dir.name, "e4_run": e4_dir.name, "precision_target": p.precision_target,
                       "test_all_classes": headline, "paired_ci95": ci, "rule_choice": choice_rows}
        if ft:
            run.summary["e4_ft_run"] = ft_dir.name
            run.summary["rule_choice_ft"] = ft.rule_choice()
            run.summary["test_by_set"] = {f"{r['strategy']}@{r['classes_set']}": {
                "macro_f1": r["macro_f1"], "mAP": r["mAP"]} for r in rows
                if r["strategy"] in ("per_tag", "per_tag_ft", "yolo_only", "yolo_only_ft")}
        for name, h in headline.items():
            run.log(f"  {name:18s} macro-F1 {h['macro_f1']:.4f} · mAP {h['mAP']:.4f}")
    return run.summary
