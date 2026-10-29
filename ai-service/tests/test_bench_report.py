"""report.py --lang en: mọi bảng phải được dịch hết (không còn chữ tiếng Việt)."""
from bench import report
from bench.report_i18n import translate_table, untranslated


class Row(dict):
    """Dòng CSV giả: cột nào chưa đặt trả "1" (đủ cho num()/float())."""

    def __missing__(self, key):
        return "1"

    def get(self, key, default=None):
        return self[key] if key in self or default is None else default


def all_tables():
    yolo = [Row(model=m, mode=mode, device="mps", images="5000", format="onnx", status="ok")
            for m in ("yolov10n", "yolo26n") for mode in ("e2e", "nms")]
    clip_r = [Row(model="ViT-B-32", pretrained="openai", dataset="flickr30k", caption_prefix="none",
                  image_preprocess="raw")]
    clip_z = [Row(model="ViT-B-32", pretrained="openai", dataset="cifar10", prompts="ensemble",
                  n_templates="18", image_preprocess="raw")]
    dino = [Row(model="dinov3-vits16", size="S", dataset="roxford5k", preprocess="pad224", query_crop="full")]
    cls = [Row(task="T1", dataset="places6", config="lp_clip", features="clip"),
           Row(task="T1", dataset="places6", config="yolo26n_cls_ft", features="image (fine-tune toàn mạng)"),
           Row(task="T2", dataset="coco", config="lp_all", features="clip+dino+yolo", parts="")]
    tags = [Row(dataset=d, config="lp_clip", tag=t, support="5", f1="0.8", AP=ap)
            for d, t, ap in (("places6", "beach", "nan"), ("coco", "pets", "0.9"), ("gallery", "night", "0.7"))]
    conf = [Row(dataset="places6", config="lp_clip", true=a, pred=b, count="3")
            for a in ("beach", "mountain") for b in ("beach", "mountain")]
    tables = [
        report.table_yolo_reproduction(yolo, "yolov10", "Tái lập YOLOv10 (paper Table 1) — COCO val2017",
                                       "AP50-95 (%). Paper: AP chính = NMS-free, AP† = one-to-many + NMS."),
        report.table_yolo_reproduction(yolo, "yolo26", "Tái lập YOLO26 (Ultralytics docs) — COCO val2017",
                                       "AP50-95 (%). Docs: cột mAPval 50-95 = + NMS, cột (e2e) = NMS-free."),
        report.table_yolo_compare(yolo, yolo), report.table_yolo_latency(yolo), report.table_yolo_export(yolo),
        report.table_clip_retrieval(clip_r), report.table_clip_zeroshot(clip_z),
        report.table_dino_retrieval(dino), report.table_cls_t1(cls), report.table_cls_t2(cls),
        report.table_cls_confusion(cls, conf),
        report.table_cls_per_tag(tags, "places6", "Classification T1 — theo từng tag cảnh"),
        report.table_cls_per_tag(tags, "coco", "Classification T2 — theo từng tag đối tượng"),
        report.table_cls_per_tag(tags, "gallery", "Hệ thống 17 tag — theo từng tag (gallery)"),
    ]
    assert all(tables), [i for i, t in enumerate(tables) if not t]
    return tables


def test_english_report_has_no_vietnamese_left():
    english = [translate_table(t, "en") for t in all_tables()]
    assert untranslated(english) == set()
    assert "Configuration" in english[8][2] and "Portrait" not in english[8][2]


def test_vietnamese_report_is_unchanged():
    tables = all_tables()
    assert [translate_table(t, "vi") for t in tables] == tables
