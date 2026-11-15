"""bench/search_eval.py: hiểu truy vấn + chấm điểm phải khớp backend
(search.query.js / hybrid.search.service.js) — các ca dưới đây cũng là output
của parseQuery bên backend."""
import numpy as np
import pytest

from bench.search_eval import Index, count_phrase, parse_query, score


@pytest.mark.parametrize(
    "query, tags, objects",
    [
        ("2 con chó trên bãi biển", ["beach"], [("dog", 2)]),
        ("hai chiếc xe đạp", [], [("bicycle", 2)]),
        ("two dogs on the beach", ["beach"], [("dog", 2)]),
        ("3匹の犬", [], [("dog", 3)]),
        ("犬が2匹", [], [("dog", 2)]),
        ("二人", [], [("person", 2)]),
        ("ba lô màu đỏ", [], [("backpack", None)]),
        ("sunset at the beach", ["sunset", "beach"], []),
        ("người đi xe máy ban đêm", ["night"], [("motorcycle", None), ("person", None)]),
        ("日本の山", ["mountain"], []),
        ("hoa sen", [], []),
        ("thác nước", [], []),
    ],
)
def test_parse_query_matches_backend(query, tags, objects):
    parsed = parse_query(query)
    assert parsed["tags"] == tags
    assert sorted((o["cls"], o["count"]) for o in parsed["objects"]) == sorted(objects)


@pytest.mark.parametrize(
    "query, coverage, labels",
    [("2 con chó trên bãi biển", 1.0, True), ("người", 1.0, True), ("人", 1.0, True),
     ("hoa sen", 0.5, True),  # "hoa" = nhãn chi tiết oi.flower
     ("hoa sen", 0.0, False)],
)
def test_coverage(query, coverage, labels):
    assert parse_query(query, labels=labels)["coverage"] == pytest.approx(coverage)


@pytest.mark.parametrize("lang", ["vi", "en", "ja"])
def test_generated_count_queries_parse_back(lang):
    for cls, n in [("dog", 2), ("person", 3), ("car", 1)]:
        parsed = parse_query(count_phrase(cls, n, lang))
        assert [(o["cls"], o["count"]) for o in parsed["objects"]] == [(cls, n)], lang


def test_hybrid_count_query_prefers_exact_count():
    # 3 ảnh: 2 con chó · 1 con chó · không chó — CLIP như nhau.
    clip = np.tile(np.eye(4)[0], (3, 1))
    dets = [
        [{"class_name": "dog", "confidence": 0.9, "bbox": [0, 0, 1, 1]}] * 2,
        [{"class_name": "dog", "confidence": 0.9, "bbox": [0, 0, 1, 1]}],
        [],
    ]
    index = Index(clip, np.zeros((3, 17)), dets)
    s = score(index, "hybrid", parse_query("2 con chó"), np.eye(4)[0], np.eye(4)[1], 100.0)
    assert s[0] > s[1] > s[2]
    assert s[0] > 0.8 and s[2] < 0.1


# ── Nhãn chi tiết ("oi.*") ────────────────────────────────────────────────
@pytest.mark.parametrize(
    "query, labels",
    [
        ("thác nước", [("oi.waterfall", None)]),
        ("2 con chó trên bãi biển", [("oi.beach", ("tag", "beach")), ("oi.dog", ("object", "dog"))]),
        ("滝と犬", [("oi.dog", ("object", "dog")), ("oi.waterfall", None)]),
        ("ô tô màu đỏ", [("oi.car", ("object", "car"))]),  # "ô" (dù) không khớp bên trong "ô tô"
    ],
)
def test_parse_query_labels(query, labels):
    got = [(lb["id"], (lb["link"]["kind"], lb["link"]["id"]) if lb["link"] else None)
           for lb in parse_query(query)["labels"]]
    assert got == labels
    assert parse_query(query, labels=False)["labels"] == []


def test_linked_label_rescues_missed_object_and_standalone_label_is_required():
    clip = np.tile(np.eye(4)[0], (3, 1))
    dets = [[{"class_name": "dog", "confidence": 0.9, "bbox": [0, 0, 1, 1]}], [], []]
    labels = {"oi.dog": np.array([0.0, 0.9, 0.0]), "oi.waterfall": np.array([0.9, 0.9, 0.0])}
    index = Index(clip, np.zeros((3, 17)), dets, labels)
    # ảnh 1: YOLO bỏ sót chó nhưng nhãn oi.dog thấy → không bị loại
    s = score(index, "hybrid", parse_query("chó"), np.eye(4)[0], np.eye(4)[1], 100.0)
    assert s[0] > 0.8 and s[1] > 0.8 and s[2] < 0.1
    # "chó và thác nước": nhãn đứng riêng là điều kiện AND
    s = score(index, "hybrid", parse_query("chó và thác nước"), np.eye(4)[0], np.eye(4)[1], 100.0)
    assert s[0] > 0.8 and s[1] > 0.8 and s[2] < 0.1


# ── Khớp 1:1 với backend (chạy chính code JS bằng node) ───────────────────
PARITY_QUERIES = [
    "2 con chó trên bãi biển", "two dogs on the beach", "犬が2匹", "thác nước", "cà phê sáng",
    "dogs and waterfall", "ô tô màu đỏ", "cái ô", "滝と犬", "hoa sen", "sunset at the beach",
    "người đi xe máy ban đêm", "ba lô màu đỏ", "bánh mì và cà phê", "một cái bàn phím", "空港",
]


def _node(script: str) -> object:
    import json
    import shutil
    import subprocess

    from bench.common import SERVICE_ROOT

    if shutil.which("node") is None:
        pytest.skip("không có node")
    backend = SERVICE_ROOT.parent / "backend"
    out = subprocess.run(["node", "--input-type=module", "-e", script], cwd=backend,
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_parser_parity_with_backend():
    import json

    js = _node(
        "import { parseQuery } from './src/modules/ai/search.query.js';"
        f"const qs = {json.dumps(PARITY_QUERIES, ensure_ascii=False)};"
        "console.log(JSON.stringify(qs.map((q) => parseQuery(q))));"
    )
    for query, j in zip(PARITY_QUERIES, js):
        p = parse_query(query)
        assert j["tags"] == p["tags"], query
        assert j["objects"] == p["objects"], query
        assert j["labels"] == p["labels"], query
        assert j["coverage"] == pytest.approx(p["coverage"]), query


def test_score_parity_with_backend():
    """scoreRow (JS, 1 ảnh) == score (bench, vector hoá) trên vài ảnh tổng hợp."""
    import json

    rows = [
        {"clip": 0.9, "tags": {"beach": 0.8, "oi.dog": 0.7}, "objects": {"dog": {"n": 2, "conf": 0.6}}},
        {"clip": 0.2, "tags": {"oi.waterfall": 0.95, "oi.beach": 0.9}, "objects": {}},
        {"clip": 0.5, "tags": {"oi.dog": 0.85, "oi.coffee": 0.3}, "objects": {"dog": {"n": 1, "conf": 0.5}}},
    ]
    queries = ["2 con chó trên bãi biển", "thác nước", "chó và thác nước", "cà phê sáng", "chó"]
    js = _node(
        "import { scoreRow } from './src/modules/ai/hybrid.search.service.js';"
        "import { parseQuery } from './src/modules/ai/search.query.js';"
        f"const rows = {json.dumps(rows)}; const qs = {json.dumps(queries, ensure_ascii=False)};"
        "console.log(JSON.stringify(qs.map((q) => rows.map((r) => scoreRow(r, parseQuery(q)).score))));"
    )
    # Dựng Index sao cho thành phần CLIP đúng bằng row.clip (đi qua clip_probabilities với < 30 ảnh).
    from app.tagging.taxonomy import TAG_IDS

    tag_probs = np.zeros((len(rows), len(TAG_IDS)))
    labels: dict[str, np.ndarray] = {}
    dets = []
    for i, r in enumerate(rows):
        for k, v in r["tags"].items():
            if k.startswith("oi."):
                labels.setdefault(k, np.zeros(len(rows)))[i] = v
            else:
                tag_probs[i, TAG_IDS.index(k)] = v
        dets.append([{"class_name": c, "confidence": o["conf"], "bbox": [0, 0, 1, 1]}
                     for c, o in r["objects"].items() for _ in range(o["n"])])
    scale = 1.0
    margins = np.log(np.array([r["clip"] for r in rows]) / (1 - np.array([r["clip"] for r in rows])))
    clip = np.zeros((len(rows), 2))
    clip[:, 0] = margins  # q = e0, neg = 0 → margin = clip[:, 0]
    index = Index(clip, tag_probs, dets, labels)
    for q, expected in zip(queries, js):
        got = score(index, "hybrid", parse_query(q), np.array([1.0, 0.0]), np.zeros(2), scale)
        np.testing.assert_allclose(got, expected, atol=1e-6, err_msg=q)
