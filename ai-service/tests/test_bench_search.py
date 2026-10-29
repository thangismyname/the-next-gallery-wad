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
    ],
)
def test_parse_query_matches_backend(query, tags, objects):
    parsed = parse_query(query)
    assert parsed["tags"] == tags
    assert sorted((o["cls"], o["count"]) for o in parsed["objects"]) == sorted(objects)


@pytest.mark.parametrize(
    "query, coverage",
    [("2 con chó trên bãi biển", 1.0), ("người", 1.0), ("人", 1.0), ("hoa sen", 0.0)],
)
def test_coverage(query, coverage):
    assert parse_query(query)["coverage"] == pytest.approx(coverage)


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
