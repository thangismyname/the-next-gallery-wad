"""E6 — Search lai: tag + CLIP.

Các cấu hình xếp hạng:
  clip        điểm = cos(query, ảnh)                              (= E3)
  filter      ảnh thiếu một tag mà query nhắc tới bị đẩy xuống cuối  (lọc cứng)
  boost       điểm = cos + λ · (tỉ lệ tag query nhắc tới có trong ảnh)          — tag 0/1
  boost_prob  điểm = cos + λ · (trung bình XÁC SUẤT đã calibrate của các lớp đó) — mềm, không mất thông tin ngưỡng
Tag lấy từ các nguồn:
  yolo · clip · fused                       decisions.npz của E5 (không train, cùng precision target)
  lp_clip · lp_dino · lp_clip_dino · fused_learned   decisions.npz của `probe` (CÓ TRAIN trên split train)
  yolo_ft · fused_ft                        E5 chạy với `--e4-ft-run` (YOLO fine-tune trên Open Images)
  fused_learned_ft                          `probe --yolo models/yolo26n-oi-….pt --no-latest` → `--probe-ft-run`
Nguồn nào thiếu run (chưa chạy E5 / probe) thì bị bỏ, có ghi log. Thêm mốc
  oracle  = nhãn NGƯỜI xác minh của Open Images (Y = 1) — TRẦN: tag hoàn hảo giúp search tối đa
          bao nhiêu. Không phải model, không đưa vào "tốt nhất". Nhãn chưa xác minh (-1) tính là
          không có tag → trần này hơi thấp hơn trần thật; result.json ghi tỉ lệ -1 để biết lệch bao nhiêu.
λ chọn trên caption VAL (MRR) cho từng (cấu hình, nguồn), rồi dùng nguyên cho test.

Query:
  captions       caption Localized Narratives (E3b). Lớp "được nhắc tới" = tên lớp / từ đồng
                 nghĩa xuất hiện trong caption (chỉ đọc chữ, không nhìn nhãn ảnh).
  compositional  query ghép (queries.csv, cột classes) — chấm tay qua pool như E3c.
Ground truth vẫn là caption gốc / chấm tay, không dùng CLIP để chấm.
Query không nhắc lớp nào → mọi cấu hình bằng nhau; bảng tách riêng nhóm `named`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from experiments import judging
from experiments import metrics as M
from experiments.core import CommonParams, Run, find_run, opt
from experiments.e3_search import first_sentence
from experiments.features import APP_CLIP, clip_image_features, encode_texts
from experiments.oi_data import images_dir, load_subset
from pipeline.folder import apply_query_template

E5_SOURCES = ("yolo", "clip", "fused", "yolo_ft", "fused_ft")
PROBE_SOURCES = ("lp_clip", "lp_dino", "lp_clip_dino", "fused_learned")
PROBE_FT_SOURCES = ("fused_learned_ft",)  # = fused_learned của run probe dùng YOLO fine-tune
SOURCES = (*E5_SOURCES, *PROBE_SOURCES, *PROBE_FT_SOURCES, "oracle")
MODES = ("filter", "boost", "boost_prob")
DEFAULT_COMPARE = (  # cấu hình nguồn a − b; "clip" = CLIP thuần
    "boost_prob:fused_learned,boost_prob:yolo",      # fusion có học vs YOLO (nguồn tốt nhất không train)
    "boost_prob:lp_clip,boost_prob:clip",            # train (cùng feature CLIP) vs zero-shot
    "boost_prob:lp_dino,boost_prob:lp_clip",         # feature độc lập vs cùng feature với search
    "boost_prob:fused_learned,boost_prob:lp_clip",   # thêm nguồn độc lập
    "boost_prob:fused_learned,boost:fused_learned",  # xác suất vs tag 0/1
    "filter:fused_learned,boost_prob:fused_learned", # lọc cứng vs cộng điểm
    "boost_prob:yolo_ft,boost_prob:yolo",            # YOLO fine-tune vs YOLO gốc (COCO)
    "boost_prob:fused_ft,boost_prob:fused",          # quy tắc E5 với YOLO fine-tune vs gốc
    "boost_prob:fused_learned_ft,boost_prob:fused_learned",  # fusion có học với YOLO fine-tune vs gốc
)


def parse_config(text: str) -> tuple[str, str | None]:
    mode, _, source = text.strip().partition(":")
    return (mode, None) if mode == "clip" else (mode, source)


def pairwise_rows(values: dict, compare: list[str], n_boot: int, metric: str) -> list[dict]:
    """values[(mode, source)] = mảng điểm từng query (cùng thứ tự) → CI bootstrap ghép cặp của trung bình a − b.
    Cặp có cấu hình không chạy (nguồn thiếu run) bị bỏ qua."""
    rows = []
    for item in compare:
        a_txt, _, b_txt = item.partition(",")
        a, b = parse_config(a_txt), parse_config(b_txt)
        if a not in values or b not in values:
            continue
        va, vb = np.asarray(values[a], float), np.asarray(values[b], float)
        ok = ~(np.isnan(va) | np.isnan(vb))
        va, vb = va[ok], vb[ok]
        row = {"a": a_txt.strip(), "b": b_txt.strip(), "metric": metric, "queries": int(ok.sum()),
               "a_mean": float(va.mean()) if len(va) else float("nan"),
               "b_mean": float(vb.mean()) if len(vb) else float("nan"),
               "diff": float((va - vb).mean()) if len(va) else float("nan")}
        if n_boot and len(va):
            row.update({f"diff_{k}": v for k, v in M.bootstrap_ci(
                lambda idx: {"ci": float((va[idx] - vb[idx]).mean())}, len(va), n_boot).items()})
        rows.append(row)
    return rows
CEILING_SOURCES = ("oracle",)  # mốc trần, không phải model — summary/report không tính vào "tốt nhất"
FILTER_PENALTY = -2.0  # cos ∈ [-1, 1] → ảnh bị lọc luôn đứng sau ảnh qua lọc

# Từ đồng nghĩa hay gặp trong caption tiếng Anh (bổ sung tên lớp / cột prompt).
SYNONYMS = {
    "Person": ["people", "man", "men", "woman", "women", "boy", "boys", "girl", "girls", "child",
               "children", "kid", "kids", "lady", "person", "persons", "guy"],
    "Cattle": ["cow", "cows", "bull", "cattle"], "Couch": ["sofa", "couch"], "Television": ["tv", "television"],
    "Mobile phone": ["phone", "mobile", "cellphone", "smartphone"], "Flying disc": ["frisbee"],
    "Doughnut": ["donut", "doughnut"], "Footwear": ["shoe", "shoes", "footwear", "sneakers"],
    "Human face": ["face", "faces"], "Kitchen & dining room table": ["dining table", "table"],
    "Mug": ["mug", "cup"], "Coffee cup": ["coffee cup", "cup"], "Sea": ["sea", "ocean"],
    "Houseplant": ["houseplant", "potted plant", "plant pot"],
}


@dataclass
class E6Params(CommonParams):
    clip: str = opt(APP_CLIP, "CLIP của app.")
    preprocess: str = opt("backend", "Tiền xử lý ảnh.", choices=["backend", "raw"])
    sources: list[str] = opt(list(SOURCES), "Nguồn tag (thiếu run E5 / probe → bỏ nguồn đó).", choices=SOURCES)
    modes: list[str] = opt(list(MODES), "Cấu hình dùng tag (luôn có thêm `clip` làm gốc).", choices=MODES)
    lambdas: list[float] = opt([0.0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5],
                               "Lưới λ cho boost / boost_prob (chọn trên val; λ = 0 = không cộng điểm).")
    query_sets: list[str] = opt(["captions", "compositional"], "Bộ query.")
    caption_variant: str = opt("full", "Caption dùng.", choices=["full", "first_sentence"])
    lang: str = opt("en", "Ngôn ngữ query ghép (CLIP app chỉ hiểu tiếng Anh).")
    top_k: int = opt(20, "Số ảnh đầu chấm tay / query (compositional).")
    e5_run: str = opt("", "Run E5 dùng (trống = latest).")
    probe_run: str = opt("", "Run probe dùng (trống = latest).")
    probe_ft_run: str = opt("", "Run probe với YOLO fine-tune (trống = bỏ nguồn fused_learned_ft).")
    compare: list[str] = opt(list(DEFAULT_COMPARE), "Cặp cấu hình 'mode:nguồn,mode:nguồn' (a − b) cần CI ghép cặp, "
                             "cho cả caption (Δ MRR) và query ghép (Δ P@10, bootstrap theo query).")
    bootstrap: int = opt(500, "Bootstrap ghép cặp cho chênh lệch MRR so với clip.")
    batch_size: int = opt(64, "Batch encode ảnh.")


def class_patterns(classes: list[dict]) -> list[re.Pattern]:
    pats = []
    for c in classes:
        base = re.sub(r"\s*\(.*\)$", "", c["oi_name"]).lower()  # "Ball (Object)" → "ball"
        words = {base, *(w.lower() for w in SYNONYMS.get(c["oi_name"], []))}
        if c.get("prompt"):
            words.add(c["prompt"].lower())
        alts = sorted({re.escape(w) + "(?:s|es)?" for w in words}, key=len, reverse=True)
        pats.append(re.compile(r"\b(?:" + "|".join(alts) + r")\b"))
    return pats


def named_matrix(texts: list[str], pats: list[re.Pattern]) -> np.ndarray:
    return np.asarray([[bool(p.search(t.lower())) for p in pats] for t in texts], dtype=np.float32)


def extra_scores(mode: str, N: np.ndarray, D: np.ndarray, lam: float = 0.0) -> np.ndarray | None:
    """(n_query, n_img) cộng vào cosine. N = lớp query nhắc tới, D = tag ảnh (0/1; boost_prob: xác suất)."""
    if mode == "clip":
        return None
    n_named = N.sum(axis=1, keepdims=True)
    present = (N @ D.T.astype(np.float32))
    frac = np.divide(present, n_named, out=np.zeros_like(present), where=n_named > 0)
    if mode in ("boost", "boost_prob"):
        return lam * frac
    return np.where((n_named > 0) & (frac < 1.0), FILTER_PENALTY, 0.0).astype(np.float32)


def caption_queries(subset, variant: str) -> tuple[list[str], np.ndarray]:
    idx = [i for i, img in enumerate(subset.image_ids) if subset.captions.get(img)]
    caps = [subset.captions[subset.image_ids[i]][0] for i in idx]
    if variant == "first_sentence":
        caps = [first_sentence(c) for c in caps]
    return caps, np.asarray(idx)


def run(p: E6Params) -> dict:
    with Run("e6", p) as run:
        run.stage("load")
        val, test = load_subset(p.root, "validation", p.smoke), load_subset(p.root, "test", p.smoke)
        D, P, summary = {}, {}, {}  # D = tag 0/1, P = xác suất (cho boost_prob) theo (nguồn, split)
        sources = list(p.sources)
        loaders = (("e5", "e5", p.e5_run, E5_SOURCES, ""), ("probe", "probe", p.probe_run, PROBE_SOURCES, ""),
                   ("probe_ft", "probe", p.probe_ft_run, PROBE_FT_SOURCES, "_ft"))
        for label, exp, run_id, group, suffix in loaders:
            wanted = [s for s in sources if s in group]
            if not wanted:
                continue
            if suffix and not run_id:  # run biến thể (--no-latest) → không có latest, phải chỉ định
                sources = [s for s in sources if s not in wanted]
                continue
            try:
                d = find_run(p.root, exp, run_id, run.smoke)
            except SystemExit:
                run.log(f"  ! chưa có run {label} — bỏ nguồn {wanted}")
                sources = [s for s in sources if s not in wanted]
                continue
            dec = dict(np.load(d / "artifacts" / "decisions.npz", allow_pickle=False))
            if list(dec["ids_val"]) != val.image_ids or list(dec["ids_test"]) != test.image_ids:
                raise SystemExit(f"{exp} {d.name} chạy trên tập ảnh khác — chạy lại {exp}.")
            for s in wanted:
                key = s.removesuffix(suffix) if suffix else s  # fused_learned_ft ← fused_learned của run probe_ft
                if f"{key}_val" not in dec:
                    run.log(f"  ! {exp} {d.name} không có nguồn {key} — bỏ {s}")
                    sources.remove(s)
                    continue
                for sp in ("val", "test"):
                    D[(s, sp)] = dec[f"{key}_{sp}"]
                    if f"{key}_prob_{sp}" in dec:
                        P[(s, sp)] = dec[f"{key}_prob_{sp}"]
            summary[f"{label}_run"] = d.name
        if "oracle" in sources:
            for sp, sub in (("val", val), ("test", test)):
                D[("oracle", sp)] = P[("oracle", sp)] = (sub.Y == 1).astype(np.uint8)
        no_prob = [s for s in sources if ("boost_prob" in p.modes and (s, "val") not in P)]
        if no_prob:
            run.log(f"  ! không có xác suất cho {no_prob} (E5 cũ — chạy lại e5) → bỏ boost_prob của các nguồn này")
        summary["sources"] = sources

        def tag_matrix(mode: str, s: str, sp: str) -> np.ndarray:
            return P[(s, sp)] if mode == "boost_prob" else D[(s, sp)]

        pairs_ms = [(m, s) for s in sources for m in p.modes if m != "boost_prob" or (s, "val") in P]
        Xv = clip_image_features(val.name, val.image_ids, val.paths(), p.root, p.clip, p.preprocess,
                                 p.device, p.batch_size, run=run)
        Xt = clip_image_features(test.name, test.image_ids, test.paths(), p.root, p.clip, p.preprocess,
                                 p.device, p.batch_size, run=run)
        pats = class_patterns(test.classes)

        # ── chọn λ trên caption val ────────────────────────────────────────
        boosts = [(m, s) for m, s in pairs_ms if m != "filter"]
        lam0 = min((x for x in p.lambdas if x > 0), default=0.0)  # không có caption val → λ dương nhỏ nhất như trước
        best_lam = {(m, s): lam0 for m, s in boosts}
        cap_v, tgt_v = caption_queries(val, p.caption_variant)
        edge = []
        if cap_v and boosts:
            run.stage("chọn λ trên caption val")
            Qv, Nv = encode_texts(p.clip, cap_v, p.device), named_matrix(cap_v, pats)
            lam_rows = []
            for m, s in boosts:
                best = None
                for lam in p.lambdas:
                    mrr = M.recall_from_ranks(M.target_ranks(Qv, Xv, tgt_v, extra=extra_scores(
                        m, Nv, tag_matrix(m, s, "val"), lam)))["MRR"]
                    lam_rows.append({"mode": m, "source": s, "lambda": lam, "val_MRR": mrr})
                    if best is None or mrr > best[0]:
                        best = (mrr, lam)
                best_lam[(m, s)] = best[1]
                at_edge = len(p.lambdas) > 1 and best[1] in (min(p.lambdas), max(p.lambdas)) and best[1] != 0  # λ = 0 là biên tự nhiên
                if at_edge:
                    edge.append(f"{m}:{s}")
                run.log(f"  {m:10s} {s:13s} λ = {best[1]} (val MRR {best[0]:.4f})" + ("  ! biên lưới" if at_edge else ""))
            run.table("lambda_val", lam_rows)
            if edge:
                run.log(f"  ! λ nằm ở biên lưới cho {edge} — cân nhắc mở rộng --lambdas")
        elif boosts:
            run.log("  ! val không có caption — dùng λ đầu lưới")
        summary["lambda"] = {f"{m}:{s}": lam for (m, s), lam in best_lam.items()}
        summary["lambda_at_grid_edge"] = edge

        configs = [("clip", None)] + pairs_ms

        def extra_for(mode, s, N, sp):
            if mode == "clip":
                return None
            return extra_scores(mode, N, tag_matrix(mode, s, sp), best_lam.get((mode, s), 0.0))

        # ── captions (test) ────────────────────────────────────────────────
        if "captions" in p.query_sets:
            cap_t, tgt_t = caption_queries(test, p.caption_variant)
            if cap_t:
                run.stage("captions test")
                Qt, Nt = encode_texts(p.clip, cap_t, p.device), named_matrix(cap_t, pats)
                named = Nt.sum(axis=1) > 0
                if "oracle" in sources:  # lớp caption nhắc tới: ảnh đích có nhãn gì? (độ tin của trần)
                    lab = test.Y[tgt_t][Nt > 0]
                    share = {k: float((lab == v).mean()) if lab.size else 0.0
                             for k, v in (("positive", 1), ("negative", 0), ("unknown", -1))}
                    summary["oracle_named_pairs"] = {"pairs": int(lab.size), **share}
                    run.log(f"  oracle: {lab.size} cặp (caption, lớp nhắc tới) — ảnh đích positive "
                            f"{share['positive']:.1%} · negative {share['negative']:.1%} · chưa xác minh {share['unknown']:.1%}")
                ranks = {}
                for mode, s in configs:
                    ranks[(mode, s)] = M.target_ranks(Qt, Xt, tgt_t, extra=extra_for(mode, s, Nt, "test"))
                rows = []
                for (mode, s), r in ranks.items():
                    base = ranks[("clip", None)]
                    row = {"mode": mode, "source": s or "-", "ceiling": s in CEILING_SOURCES,
                           **M.recall_from_ranks(r)}
                    if named.any():
                        row.update({f"named_{k}": v for k, v in M.recall_from_ranks(r[named]).items()})
                    if p.bootstrap and mode != "clip":
                        row.update({f"dMRR_{k}": v for k, v in M.bootstrap_ci(
                            lambda idx: {"ci": float((1 / r[idx]).mean() - (1 / base[idx]).mean())},
                            len(r), p.bootstrap).items()})
                    rows.append(row)
                    run.log(f"  {mode:10s} {s or '-':13s} R@1 {row['R@1']:.3f} · MRR {row['MRR']:.4f}")
                run.table("captions", rows)
                pw = pairwise_rows({k: 1 / v for k, v in ranks.items()}, p.compare, p.bootstrap, "MRR")
                if pw:
                    run.table("captions_pairwise", pw)
                summary["captions"] = {"queries": len(cap_t), "named_queries": int(named.sum()), "rows": rows,
                                       "pairwise": pw}

        # ── compositional (test, chấm tay) ────────────────────────────────
        if "compositional" in p.query_sets and judging.QUERIES_PATH.exists():
            run.stage("query ghép")
            queries = [q for q in judging.read_queries() if q.get(f"query_{p.lang}")]
            name_to_idx = {c["oi_name"]: j for j, c in enumerate(test.classes)}
            N = np.zeros((len(queries), len(test.classes)), np.float32)
            for k, q in enumerate(queries):
                for name in filter(None, (x.strip() for x in q.get("classes", "").split(";"))):
                    if name not in name_to_idx:
                        raise SystemExit(f"queries.csv {q['id']}: lớp {name!r} không có trong mapping.")
                    N[k, name_to_idx[name]] = 1
            Q = encode_texts(p.clip, [apply_query_template(q[f"query_{p.lang}"]) for q in queries], p.device)
            S = Q @ Xt.T
            pool, rows, pairs, merged = judging.read_pool(p.root), [], [], {}
            per_query = {}  # (mode, source) → (P@10, nDCG@10) từng query — bootstrap theo query
            for mode, s in configs:
                extra = extra_for(mode, s, N, "test")
                SS = S if extra is None else S + extra
                ranked = {q["id"]: [test.image_ids[i] for i in np.argsort(-SS[k])[:p.top_k]]
                          for k, q in enumerate(queries)}
                for q, ids in ranked.items():
                    pairs += [(q, i) for i in ids]
                    merged.setdefault(q, []).extend(i for i in ids if i not in merged.get(q, []))
                res = judging.judged_metrics(ranked, pool)
                per_query[(mode, s)] = (np.array([r["P@10"] for r in res["per_query"]]),
                                        np.array([r["nDCG@10"] for r in res["per_query"]]))
                rows.append({"mode": mode, "source": s or "-", "ceiling": s in CEILING_SOURCES, **res["summary"]})
            base_p, base_n = per_query[("clip", None)]
            for row, ((mode, _source), (pq, nq)) in zip(rows, per_query.items()):
                if p.bootstrap and mode != "clip":
                    row.update({f"dP@10_{k}": v for k, v in M.bootstrap_ci(
                        lambda idx: {"ci": float((pq[idx] - base_p[idx]).mean())}, len(pq), p.bootstrap).items()})
                    row.update({f"dnDCG@10_{k}": v for k, v in M.bootstrap_ci(
                        lambda idx: {"ci": float((nq[idx] - base_n[idx]).mean())}, len(nq), p.bootstrap).items()})
            pw = pairwise_rows({k: v[0] for k, v in per_query.items()}, p.compare, p.bootstrap, "P@10")
            added = judging.add_to_pool(p.root, pairs)
            pool = judging.read_pool(p.root)
            n = judging.write_judge_html(run.dir / "judge.html", "E6 — cặp chưa chấm",
                                         {q["id"]: q[f"query_{p.lang}"] for q in queries}, merged, pool,
                                         lambda i: images_dir(p.root, "test") / f"{i}.jpg")
            run.table("compositional", rows)
            if pw:
                run.table("compositional_pairwise", pw)
            summary["compositional"] = {"rows": rows, "unjudged_pairs": n, "queries": len(queries), "pairwise": pw}
            if n:
                run.log(f"  → {n} cặp chưa chấm ({added} mới): {run.dir / 'judge.html'} · điền "
                        f"{judging.pool_path(p.root)} rồi chạy lại e6")
        run.summary = summary
    return run.summary
