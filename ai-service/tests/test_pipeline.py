"""pipeline/folder.py trên folder ảnh giả + provider giả (không cần model)."""
import io
import json

import numpy as np
from PIL import Image

from app.providers.embed_stub import StubEmbeddingProvider
import pytest

from pipeline.folder import (
    apply_query_template,
    classify_run,
    list_datasets,
    load_run,
    prepare,
    resolve_dataset,
    resolve_result,
    result_dir_for,
    run_folder,
    search_run,
)


class FakeYolo:
    name, model = "fake", "fake-yolo"

    def detect(self, image_bytes):
        width = Image.open(io.BytesIO(image_bytes)).width
        if width > 100:  # ảnh "lớn" có 1 con chó
            return [{"class_name": "dog", "confidence": 0.9, "bbox": [0.1, 0.1, 0.5, 0.5]}]
        return []


def _make_folder(tmp_path):
    folder = tmp_path / "photos"
    (folder / "sub").mkdir(parents=True)
    Image.new("RGB", (2000, 1000), (200, 10, 10)).save(folder / "big.jpg")
    Image.new("RGB", (64, 64), (10, 200, 10)).save(folder / "sub" / "small.png")
    (folder / "broken.jpg").write_bytes(b"not an image")
    (folder / "notes.txt").write_text("skip me")
    return folder


def test_query_template_matches_backend():
    assert apply_query_template("dog") == "a photo of a dog"
    assert apply_query_template("red car.") == "a photo of a red car"
    assert apply_query_template("a dog on the beach") == "a dog on the beach"


def test_prepare_app_matches_backend_sizes():
    buffer = io.BytesIO()
    Image.new("RGB", (2000, 1000)).save(buffer, format="JPEG")
    clip_bytes, yolo_bytes = prepare(buffer.getvalue(), "app")
    assert Image.open(io.BytesIO(clip_bytes)).size == (512, 256)
    assert Image.open(io.BytesIO(yolo_bytes)).size == (1280, 640)


def test_run_search_classify(tmp_path):
    folder = _make_folder(tmp_path)
    out = tmp_path / "run"
    clip = StubEmbeddingProvider()
    meta = run_folder(folder, out, clip=clip, yolo=FakeYolo(), batch_size=1, draw=5)

    assert meta["images"] == 2 and meta["errors"] == 1
    assert meta["class_counts"] == {"dog": {"boxes": 1, "images": 1}}
    assert (out / "errors.txt").read_text().startswith(str(folder / "broken.jpg"))
    assert (out / "vis" / "big.jpg").exists()
    assert json.loads((out / "meta.json").read_text())["clip"]["dimension"] == clip.dimension

    meta, images, detections, embeddings = load_run(out)
    assert [r["path"] for r in images] == ["big.jpg", "sub/small.png"]
    assert embeddings.shape == (2, clip.dimension)

    # chỉ lọc object → chỉ ảnh có chó
    [res] = search_run(meta, images, detections, embeddings, [], object_name="dog")
    assert [h["path"] for h in res["hits"]] == ["big.jpg"]

    # query + tắt ngưỡng → trả cả 2 ảnh, prompt bọc template
    [res] = search_run(meta, images, detections, embeddings, ["dog"], clip=clip, min_sim=-1)
    assert res["prompt"] == "a photo of a dog" and len(res["hits"]) == 2

    probs = classify_run(embeddings, ["a", "b", "c"], clip, ["a photo of a {}"])
    assert probs.shape == (2, 3)
    np.testing.assert_allclose(probs.sum(axis=1), 1.0, atol=1e-5)


def test_dataset_and_result_resolution(tmp_path):
    folder = _make_folder(tmp_path)  # tmp_path/photos
    out = result_dir_for(folder)
    assert out == tmp_path / "result-photos"

    assert resolve_dataset("photos", tmp_path) == folder.resolve()
    assert resolve_dataset(None, tmp_path) == folder.resolve()  # chỉ 1 dataset → tự chọn
    with pytest.raises(SystemExit):
        resolve_dataset("missing", tmp_path)

    run_folder(folder, out, clip=StubEmbeddingProvider(), yolo=FakeYolo())
    assert list_datasets(tmp_path) == [folder]  # result-* không bị coi là dataset
    for name in ("photos", "result-photos", None):
        assert resolve_result(name, tmp_path) == out.resolve()

    # chạy lại → ghi đè result cũ; nhưng không bao giờ xoá folder lạ
    run_folder(folder, out, clip=StubEmbeddingProvider(), yolo=None)
    with pytest.raises(SystemExit):
        run_folder(folder, folder / "sub", clip=StubEmbeddingProvider())
    assert (folder / "sub" / "small.png").exists()
