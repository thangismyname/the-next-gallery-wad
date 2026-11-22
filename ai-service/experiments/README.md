# experiments/ — Thực nghiệm AI E1–E6 trên Open Images V7

Hiện thực phần lõi trong "The Next Gallery: kế hoạch thực nghiệm cho phần AI", gồm E1–E6. E1–E6 **không train model nào**: prompt, ngưỡng và quy tắc hợp nhất đều chọn trên **val**, còn **test** chỉ chạy một lần để báo cáo. Bản **có train** là lệnh `probe`: học trên split **train** riêng (15.000 ảnh), nên val/test vẫn giữ nguyên vai trò.

| Part | Lệnh | Trả lời | Cần |
|---|---|---|---|
| 0 | `select` → (tải ảnh) → `build` | dữ liệu + mask | annotation OI |
| 1 | `e1` | pipeline CLIP có đúng không (sanity check) | `Data/clip_benchmark/` ✅ đã tải |
| 2 | `e2` | RQ1: CLIP zero-shot tag | Part 0 |
| 3 | `e3` | RQ1: CLIP zero-shot search (a/b/c/d) | Part 0 (+ narratives, queries.csv, UIT-OpenViIC) |
| 4 | `e4` | baseline YOLO26 + các lớp YOLO không có | Part 0 |
| 4b | `yolo_ft` | fine-tune YOLO26n trên box OI (128 lớp vật thể): lấp 47 lớp ngoài COCO, có quên lớp cũ không, mAP@50-95 / latency | split train + E4 |
| 5 | `e5` | RQ2: hợp nhất YOLO + CLIP theo từng tag | E2 + E4 |
| 5b | `probe` | tag **có train**: linear probe CLIP / DINO / CLIP+DINO+YOLO vs zero-shot (E2) và quy tắc (E5) | split train + E2 + E5 |
| 6 | `e6` | RQ2: tag giúp search được bao nhiêu (+ trần `oracle`, nguồn tag có train) | E5 (+ probe, E3 c) |

Mọi lệnh chạy từ `ai-service/`: `uv run python -m experiments <lệnh> [--help]`.
**Chạy từ giao diện**: khu Developer → **Chạy** (`/dev/run`, web + mobile) — tạo job (preset hoặc từng lệnh), xem log, Dừng, xoá run; cần ai-service chạy native (`experiments/jobs.py`). Cả bộ E1→E6 + 3 YOLO fine-tune từ terminal: `uv run python -m experiments.jobs preset all` (log ở `Results/runner/<id>/log.txt`).
**Cần nhóm `bench`**: `uv sync --group bench` (scikit-learn cho calibrator isotonic). `uv sync` mặc định không cài,
các thí nghiệm sẽ lỗi `ModuleNotFoundError: sklearn`.
Lệnh nào cũng nhận `--smoke N` để chạy thử trên N ảnh mỗi split. Kết quả smoke được tách riêng và **không** ghi đè `latest`.
`--no-latest` = run biến thể (vd E4 với YOLO fine-tune) — không ghi `latest.json`, thí nghiệm sau nhận qua run id
(`e5 --e4-ft-run <id>`, `e6 --probe-ft-run <id>`). `yolo_ft --pseudo-label [--freeze 10]` = fine-tune có nhãn giả của
YOLO gốc cho lớp COCO chưa xác minh (xem `pseudo_label.py`).

```fish
uv run python -m experiments status        # file nào có / thiếu, run mới nhất của mỗi thí nghiệm
uv run python -m experiments report        # bảng tổng hợp E1–E6 + lịch sử → Results/oi/REPORT.md
uv run python -m experiments summary       # tóm tắt dễ hiểu (tự chạy sau mỗi run) → Results/oi/SUMMARY.md
```

## Đọc kết quả

| File | Dành cho | Cập nhật |
|---|---|---|
| `Results/oi/SUMMARY.md` | **đọc nhanh**: mỗi thí nghiệm hỏi gì, kết quả chính, "Nghĩa là…", bảng thay đổi so với version trước + lịch sử version | **tự động** sau mỗi run chính thức E1–E6 (version mới `vNNN` khi metric chính đổi; bản cũ ở `History/summary/SUMMARY_vNNN.md` + `index.csv`) |
| `Results/oi/REPORT.md` · `REPORT.en.md` | bảng đầy đủ (vi / en cho luận văn) | tự động cùng lúc với SUMMARY |
| `Results/oi/<exp>/<run_id>/*.csv` | chi tiết theo lớp / query | mỗi run |

## Đầu ra (chuẩn bị sẵn cho admin UI)

```text
$TNG_DATASETS/Results/oi/<lệnh>/<run_id>/
├── config.json      tham số + môi trường (chip, torch, git commit)
├── status.json      running | done | failed, stage, progress   ← UI poll file này
├── events.jsonl     log + tiến độ theo thời gian
├── result.json      tóm tắt (số đưa vào luận văn)
├── *.csv            bảng chi tiết
└── artifacts/       ngưỡng, calibrator, điểm — thí nghiệm sau dùng lại
$TNG_DATASETS/Results/oi/<lệnh>/latest.json   run chính thức mới nhất (E5 tự đọc E2/E4 từ đây)
$TNG_DATASETS/History/<lệnh>/vNNN_<ngày>_<máy>_<commit>/ + index.csv   bản lưu mỗi run chính thức
```

`uv run python -m experiments schema` in tham số của mọi lệnh dưới dạng JSON (tên, kiểu, mặc định, help, choices). Sau này UI dựng form từ đó rồi gọi lại CLI với `--params-json '{...}'`.

Feature được cache trong `$TNG_DATASETS/Results/cache/oi/`: CLIP embedding và YOLO detection của mỗi split chỉ tính một lần, rồi E2–E6 dùng chung.

---

## Bố cục thư mục dữ liệu — `database/datasets/` trong repo

Mặc định dữ liệu nằm ở `<repo>/database/datasets/`. Muốn để chỗ khác thì đặt `TNG_DATASETS` (env hoặc `.env`; path tương đối tính từ gốc repo). Trong tài liệu, `$TNG_DATASETS` = thư mục này.

**Git:** `Data/`, phần lớn `Classes/` (CSV gốc tải về), `Results/cache/`, `artifacts/*.npz`, `events.jsonl`, `judge.html`, run smoke → **ignore**. Được **commit**: `Results/oi/` (result.json, CSV, REPORT), `History/`, `Classes/open-images/subset/` (danh sách 8.000 ảnh + nhãn đã build — người khác tải đúng ảnh đó và chạy được ngay, không cần file narratives 4,6 GB) và `Classes/open-images/judgments.csv` (nhãn bạn chấm tay). VS Code đã exclude `Data/` + `Classes/` khỏi watch/search (`.vscode/settings.json`).

```text
database/datasets/
├── Data/                     ảnh (+ thứ model đọc ngay cạnh ảnh)
│   ├── open-images/{validation,test}/<ImageID>.jpg      E2–E6 (tải theo subset)
│   ├── clip_benchmark/{flickr30k,mscoco_captions}/test/*.tar   E1 ✅
│   ├── uit-openviic/images/                             E3d (khi có)
│   ├── coco/{images,labels}/val2017 + coco-val2017.yaml  YOLOv10/YOLO26 reproduction (bench)
│   ├── places365/val_256/                               classification T1 (bench)
│   ├── cls_places6_yolo/{train,val,test}/<tag>/         YOLO26n-cls fine-tune (symlink → places365)
│   └── revisitop/{roxford5k,rparis6k}/jpg/              DINOv3 retrieval (bench, E7 sau này)
├── Classes/                  danh sách lớp + annotation
│   ├── open-images/          class descriptions, hierarchy, nhãn, box, rotation, narratives,
│   │                         subset/ (do select/build sinh), judgments.csv (chấm tay)
│   ├── uit-openviic/         test.json, translations_test.json
│   ├── coco/annotations/     instances_val2017.json (+ captions_val2017.json nếu có)
│   ├── places365/            categories_places365.txt, places365_*.txt
│   ├── revisitop/<name>/gnd_<name>.pkl
│   └── gallery-gt/labels.json  nhãn ảnh của bạn (ảnh ở Data/gallery-gt/images/)
├── Results/                  kết quả hiện tại (chạy lại thì tạo run mới)
│   ├── oi/<exp>/<run_id>/    E1–E6 + select/build
│   ├── pipeline/<dataset>/   `python -m pipeline run` (csv, embeddings, vis/ ảnh vẽ box)
│   └── cache/{oi,cls}/       feature CLIP/YOLO/DINO đã trích (xoá được, tự tính lại)
└── History/                  lưu theo version, không bao giờ ghi đè
    ├── README.md
    ├── <exp>/vNNN_<ngày-giờ>_<máy>_<commit>/   bản sao config/result/csv của run
    └── <exp>/index.csv       1 dòng / version: máy, torch, commit, data_fingerprint, tham số, metric chính
```

Mỗi run chính thức (không `--smoke`) của E1–E6 xong sẽ **tự lưu** vào `History/`. Khi đổi máy, đổi dữ liệu (cột `data_fingerprint` = mapping lớp + số ảnh) hay đổi tham số, mở `index.csv` là so được với các lần đo trước. Có thể lưu tay:

```fish
uv run python -m experiments archive e2              # run mới nhất của e2 → History/e2/vNNN
uv run python -m experiments archive bench --note "M1 Pro, trước khi đổi máy"   # chụp ai-service/bench/results
```

## Part 0 — Dữ liệu Open Images

### 0.1 Annotation → `$TNG_DATASETS/Classes/open-images/`

Lấy từ trang chính thức https://storage.googleapis.com/openimages/web/download_v7.html. Mọi link dưới đây đã kiểm tra (HTTP 200, ngày 07/11/2026).

| File | Link | Dung lượng | Dùng cho |
|---|---|---|---|
| `oidv7-class-descriptions.csv` | `https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv` | 0.5 MB | ✅ đã tải |
| `oidv7-class-descriptions-boxable.csv` | `https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions-boxable.csv` | 12 KB | ✅ đã tải |
| `bbox_labels_600_hierarchy.json` | `https://storage.googleapis.com/openimages/2018_04/bbox_labels_600_hierarchy.json` | 86 KB | ✅ đã tải |
| `oidv7-val-annotations-human-imagelabels.csv` | `https://storage.googleapis.com/openimages/v7/oidv7-val-annotations-human-imagelabels.csv` | 28 MB | ✅ đã tải — select, build (bắt buộc) |
| `oidv7-test-annotations-human-imagelabels.csv` | `https://storage.googleapis.com/openimages/v7/oidv7-test-annotations-human-imagelabels.csv` | 94 MB | ✅ đã tải — select, build (bắt buộc) |
| `validation-annotations-bbox.csv` | `https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv` | 25 MB | ✅ đã tải — build → E4 (bắt buộc) |
| `test-annotations-bbox.csv` | `https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv` | 77 MB | ✅ đã tải — build → E4 (bắt buộc) |
| `validation-images-with-rotation.csv` | `https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv` | 15 MB | ✅ đã tải — select: loại ảnh xoay (nên có) |
| `test-images-with-rotation.csv` | `https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv` | 45 MB | ✅ đã tải — select (nên có) |
| `open_images_validation_localized_narratives.jsonl` | `https://storage.googleapis.com/localized-narratives/annotations/open_images_validation_localized_narratives.jsonl` | 1.1 GB | build → E3b, E6 (chọn λ) |
| `open_images_test_localized_narratives.jsonl` | `https://storage.googleapis.com/localized-narratives/annotations/open_images_test_localized_narratives.jsonl` | 3.5 GB | build → E3b, E6 |

**Split train (tuỳ chọn, cho bản có train của E2–E6: linear probe, fusion có học, fine-tune YOLO):**

| File | Link | Dung lượng | Dùng cho |
|---|---|---|---|
| `oidv7-train-annotations-human-imagelabels.csv` | `https://storage.googleapis.com/openimages/v7/oidv7-train-annotations-human-imagelabels.csv` | 2.7 GB | select + build train (bắt buộc) |
| `train-images-boxable-with-rotation.csv` | `https://storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv` | 0.64 GB | select train: danh sách ảnh có box + loại ảnh xoay (bắt buộc khi `--train-boxable-only`, mặc định) |
| `oidv6-train-annotations-bbox.csv` | `https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv` | 2.3 GB | build train → fine-tune YOLO (E4) |

Ba link này đã kiểm tra HTTP 200 ngày 07/11/2026. Narratives của train không cần (caption chỉ dùng để *đánh giá* trên val/test).

File narratives nặng vì chứa cả vết chuột và link audio. `build` chỉ đọc caption của các ảnh trong subset, nên sau khi build xong có thể xoá hai file này.

### 0.2 Kiểm tra mapping lớp + chọn subset

Mapping ở `experiments/data/oi_classes.csv`, gồm 174 lớp: 81 lớp gắn với COCO của YOLO, vật thể ngoài COCO, và cảnh/khái niệm, có gắn 17 tag cũ. Tên lớp phải khớp **đúng** DisplayName của Open Images. `select` sẽ báo lớp sai kèm gợi ý tên gần nhất; bạn sửa CSV rồi chạy lại.

```fish
uv run python -m experiments select                 # val 3000 + test 5000 ảnh, seed 0
```

→ `Classes/open-images/subset/download_{validation,test}.txt` và `*_selection.json` (số positive/negative của từng lớp).

**Đã chạy (07/11/2026, seed 0):** val 3.000 ảnh (trung vị 27 positive/lớp, p10 20), test 5.000 ảnh (trung vị 46, p10 36); loại 460 + 1.462 ảnh bị xoay. Cách chọn là chia vòng: mỗi vòng, mỗi lớp còn dưới `min_pos` (30 val / 50 test) được thêm 1 ảnh positive, lớp hiếm đi trước. Nhờ vậy lớp phổ biến không bị bỏ đói. Một số lớp COCO rất hiếm trong Open Images vẫn thiếu: Hair dryer (0 ở val), Toaster, Flying disc, Parking meter, Toothbrush, Scissors. Lớp nào không có cả positive lẫn negative thì tự bị loại khỏi mAP và ghi rõ trong bảng theo lớp.

**Split train** (thêm sau, **không** chọn lại val/test — mỗi split ghi file riêng; Open Images đảm bảo 3 split không trùng ảnh):

```fish
uv run python -m experiments select --splits train   # 15.000 ảnh, ≥100 positive/lớp, seed 0
```

Ứng viên = ảnh **boxable** (có box → dùng lại được cho fine-tune YOLO), lấy mẫu cố định 25 % theo hash ImageID (`--train-pool-fraction`; 1.0 = cả ~1,7 triệu ảnh, chậm và tốn RAM hơn). Đọc file nhãn 2,7 GB mất vài phút. Lớp nào vẫn dưới một nửa `min_pos` thì được liệt kê trong log và `train_selection.json` → tăng `--train-pool-fraction` nếu cần.

### 0.3 Tải ảnh (chỉ ảnh trong subset)

Dùng script chính thức (để **ngoài** thư mục Datasets):

```fish
set S $TNG_DATASETS/Classes/open-images/subset
set I $TNG_DATASETS/Data/open-images
mkdir -p ~/Documents/Study/Thesis/tools
curl -L -o ~/Documents/Study/Thesis/tools/oi_downloader.py https://raw.githubusercontent.com/openimages/dataset/master/downloader.py
uv run --with boto3 --with tqdm python ~/Documents/Study/Thesis/tools/oi_downloader.py \
    $S/download_validation.txt --download_folder=$I/validation --num_processes=5
uv run --with boto3 --with tqdm python ~/Documents/Study/Thesis/tools/oi_downloader.py \
    $S/download_test.txt --download_folder=$I/test --num_processes=5
```

Tổng cộng khoảng 8.000 ảnh, cỡ 2–3 GB.

Train (15.000 ảnh, khoảng 4–5 GB) — cùng downloader, rồi build:

```fish
uv run --with boto3 --with tqdm python ~/Documents/Study/Thesis/tools/oi_downloader.py \
    $S/download_train.txt --download_folder=$I/train --num_processes=5
uv run python -m experiments build --splits train
```

### 0.4 Build

```fish
uv run python -m experiments build
```

Bước này kiểm từng ảnh (thiếu, hỏng, hoặc EXIF bị xoay) rồi dựng nhãn `Y ∈ {1, 0, -1}`, box và caption. Ảnh thiếu được ghi vào `subset/missing_<split>.txt` để bạn tải lại bằng downloader. Nếu muốn bỏ qua các ảnh này thì thêm `--allow-missing`.

**Quy ước cần ghi trong luận văn** (code ở `oi_data.py`):

- Chỉ dùng nhãn image-level do người xác minh. Cặp (ảnh, lớp) chưa có nhãn là −1 và bị mask khi tính metric.
- Cây lớp: lớp con positive thì lớp cha cũng positive (Dog → Animal). Lớp cha negative thì lớp con cũng negative. Box của lớp con được tính cho lớp cha có trong mapping (Man → Person).
- Box group-of: tính là 1 GT. Detection nằm trong box group (IoA ≥ 0.5) thì chỉ detection có điểm cao nhất được tính TP, các detection còn lại bị bỏ qua. Đây là cách Open Images chấm.
- Loại ảnh có `Rotation ≠ 0` hoặc EXIF Orientation ≠ 1, để box không bị lệch so với ảnh mà model nhìn thấy.

### 0.5 (E3d) UIT-OpenViIC — xin dữ liệu từ nhóm tác giả (arXiv:2305.04166, chỉ dùng phi thương mại)

```text
$TNG_DATASETS/Classes/uit-openviic/
├── test.json                # COCO format: images[{id, file_name}], annotations[{image_id, caption}]
└── translations_test.json   # tuỳ chọn: {"caption tiếng Việt": "english caption"} cho vi_translated
$TNG_DATASETS/Data/uit-openviic/
└── images/<file_name>       # (hoặc test/<file_name>)
```

Chưa có bản dịch thì có thể dịch máy bằng `--translate-model Helsinki-NLP/opus-mt-vi-en`. Cách này cần thêm `uv add --group bench sentencepiece sacremoses`.

---

## Part 1 — E1 sanity check CLIP

```fish
uv run python -m experiments e1 --smoke 200            # thử nhanh
uv run python -m experiments e1                        # CLIP của paper: ViT-L-14-336 (OpenAI), Table 13
uv run python -m experiments e1 --models ViT-L-14-336:openai ViT-B-32:laion2b_s34b_b79k   # + model app (không chấm Δ)
```

E1 dùng **đúng CLIP của paper**: "CLIP" trong Table 13 là ViT-L/14@336px với weights OpenAI, chạy qua OpenCLIP `ViT-L-14-336:openai` (khoảng 900 MB, tự tải về cache Hugging Face ở lần chạy đầu). Pipeline giống production: L2-normalize rồi xếp hạng cosine, cho cùng thứ tự với `<=>` của pgvector. Kết quả được đối chiếu với số Table 13 trong `experiments/data/e1_published.json`.

| Dataset | t2i R@1/5/10 | i2t R@1/5/10 |
|---|---|---|
| Flickr30k 1K test | 68.7 / 90.6 / 95.2 | 88.0 / 98.7 / 99.4 |
| MSCOCO 5K test | 37.8 / 62.4 / 72.2 | 58.4 / 81.5 / 88.1 |

Δ được chấm ở cấu hình giống paper: preprocess `raw` và caption có tiền tố `"a photo of"`. Prefix `none` và preprocess `backend` (WebP ≤512 như app) chỉ báo cáo thêm, để thấy pipeline app làm số thay đổi bao nhiêu.

**Dữ liệu** (bench/README.md mục 4): split `test` của Flickr30k và MSCOCO đã tải vào `$TNG_DATASETS/Data/clip_benchmark/` ✅.

**Xong khi:** `result.json → all_pass = true`, tức |Δ R@1| ≤ 2 điểm ở cả hai chiều. Nếu lệch nhiều thì sửa pipeline trước khi làm tiếp. Bảng chi tiết nằm trong `retrieval.csv`.

## Part 2 — E2 CLIP zero-shot tag

```fish
uv run python -m experiments e2 --smoke 200
uv run python -m experiments e2
```

| Bước | Chọn trên | Ghi ở |
|---|---|---|
| template prompt (7 template + ensemble) | val mAP | `templates.csv` |
| ngưỡng từng lớp (F1 tối đa) | val | `per_class.csv` → `threshold` |
| isotonic calibration (lớp ít mẫu dùng calibrator chung) | val | `artifacts/clip_tagger.json` |

Kết quả trên test gồm mAP, macro/micro-F1 và ECE trước và sau calibrate (`summary.csv`, chia theo all / object / scene / từng tag cũ), CI 95% bootstrap, dữ liệu reliability diagram trong `result.json`. "Trước calibrate" là xác suất zero-shot kiểu app: σ(scale·(cos lớp − cos "a photo.")).

**Xong khi:** đã có bảng theo từng lớp và theo nhóm vật thể/cảnh.

## Part 3 — E3 CLIP zero-shot search

```fish
uv run python -m experiments e3 --parts a b            # tự động
uv run python -m experiments e3 --parts c              # query ghép → chấm tay → chạy lại
uv run python -m experiments e3 --parts d              # tiếng Việt
```

- **(a) query theo lớp** dùng câu `a photo of a {lớp}` (đúng template của backend). Metric tính theo hai cách: `strict` coi ảnh chưa gán nhãn là không liên quan, còn `known` bỏ hẳn các ảnh đó. Bạn xem tay khoảng 50 dòng đầu của `a_fp_review.csv` (cột `actually_relevant`) để ước lượng có bao nhiêu FP thật ra do nhãn thiếu.
- **(b) caption Localized Narratives**: mỗi ảnh có một caption, CLIP tự cắt ở 77 token. Có thêm biến thể `first_sentence`. Metric là R@1/5/10, MRR và median rank.
- **(c) query ghép** lấy từ `experiments/data/queries.csv` (40 query mẫu vi/en, bạn bổ sung cho đủ 50–100). Lần chạy đầu ghi top-20 chưa chấm vào **pool** `Classes/open-images/judgments.csv` và sinh `judge.html` để xem ảnh. Bạn điền cột `relevant` (1/0) rồi chạy lại để có P@10/20, nDCG. Pool dùng chung cho mọi cấu hình và cho E6, nên mỗi cặp chỉ chấm một lần.
- **(d) tiếng Việt** so 3 cấu hình: `vi_direct` (CLIP app), `vi_translated` (dịch sang tiếng Anh rồi dùng CLIP app), `vi_multilingual` (`xlm-roberta-base-ViT-B-32`).

**Xong khi:** mỗi loại query và mỗi cấu hình đều có bảng.

## Part 4 — E4 YOLO26 baseline

```fish
uv run python -m experiments e4 --smoke 200
uv run python -m experiments e4
```

- `gap_classes.csv`: các lớp OI mà YOLO không có (CLIP lấp các lớp này ở E5).
- `detection_ap.csv`: mAP@0.5 theo lớp, chấm theo giao thức OI (chỉ trên ảnh đã xác minh, có group-of).
- `tag_summary.csv`: tag image-level với τ_t chọn trên val, so với ngưỡng mặc định của app (0.25 / 0.4).

Detection chạy với conf 0.001 (cache khoảng vài trăm MB JSON) để mAP tính đủ cả đường PR.

## Part 4b — YOLO-FT: fine-tune YOLO26n trên Open Images

```fish
uv run python -m experiments yolo_ft --smoke 200          # 1 epoch trên 200 ảnh/split — kiểm tra cả chuỗi (train MPS → val → so sánh)
uv run python -m experiments yolo_ft                      # 30 epoch (dừng sớm sau 10 epoch không tiến bộ)
uv run python -m experiments yolo_ft --eval-only          # đánh giá lại best.pt của run mới nhất, không train
```

Bước này train thật (mọi trọng số của YOLO26n, khởi đầu từ pretrain COCO) trên 128 lớp vật thể có box. Dataset Ultralytics được dựng bằng symlink ở `Data/open-images-yolo/`, chỉ gồm ảnh có ≥1 box. Epoch tốt nhất chọn trên val; test chỉ dùng để báo cáo. `best.pt` được chép thành `models/yolo26n-oi-<run_id>.pt`.

Kết quả gồm:
- Ultralytics mAP@50 / mAP@50-95 trên test (tách lớp COCO / ngoài COCO).
- AP@0.5 theo giao thức Open Images và tag image-level cho **cả model gốc lẫn model fine-tune**, để biết có quên 81 lớp COCO không (CI bootstrap ghép cặp), và 47 lớp ngoài COCO lên được bao nhiêu.
- Latency theo pipeline app, số tham số, kích thước file.

Trên M1 (MPS) mỗi epoch có thể mất nhiều phút. Xem thời gian epoch đầu để ước lượng; muốn nhanh hơn thì dùng `--epochs 15` hoặc `--freeze 10` (đóng băng backbone, cũng giảm quên). Nếu MPS báo lỗi thì chạy `--device cpu` (chậm hơn nhiều).

## Part 5 — E5 hợp nhất YOLO + CLIP

```fish
uv run python -m experiments e5                         # mặc định precision target 0.9
uv run python -m experiments e5 --precision-target 0.95
```

Mỗi tag thử 4 quy tắc trên xác suất đã calibrate: `clip`, `yolo`, `or` = max, `and` = min. Quy tắc được chọn là quy tắc có F1 tối đa trên val với precision ≥ target. Các file kết quả:

- `per_class.csv`: F1/precision/AP của từng quy tắc, quy tắc được chọn, có đạt target hay không.
- `strategies.csv`: so 6 chiến lược trên test (clip_only, yolo_only, or, and, group_baseline = vật thể lấy YOLO và cảnh lấy CLIP, per_tag) cho các tập lớp all / yolo_covered / object / scene.
- `rule_choice.csv`: nhóm tag nào nên lấy nguồn nào (đây là kết luận chính của C1).
- `result.json → paired_ci95`: CI bootstrap ghép cặp của phần cải thiện, per_tag − clip_only và per_tag − yolo_only.

## Part 5b — Probe: tag có train

```fish
uv run python -m experiments probe --smoke 300     # thử nhanh
uv run python -m experiments probe                 # 4 cấu hình × lưới 4 L2 × 3 trọng số cặp chưa xác minh
```

Cần split train đã build (Part 0), run E2 + E5 (làm mốc không train) và weights DINOv3 trong `models/`. Lần đầu sẽ trích CLIP + DINOv3 + YOLO cho 15.000 ảnh train (cache vào `Results/cache/oi/oi-train/`), DINO cho cả val/test. Bước này tốn thời gian nhất; các lần sau chỉ mất thời gian train probe.

| cấu hình | feature | trả lời |
|---|---|---|
| `lp_clip` | CLIP app (512) | train giúp bao nhiêu khi **cùng feature** với zero-shot |
| `lp_dino` | DINOv3 (384) | feature độc lập với CLIP search |
| `lp_clip_dino` | CLIP ⊕ DINO | |
| `fused_learned` | CLIP ⊕ DINO ⊕ YOLO (80 lớp × số box, conf, diện tích) | fusion **có học**, thay quy tắc chọn tay của E5 |

Mọi hàng, kể cả hai mốc không train `zs_clip` (E2) và `e5_per_tag` (E5), đi qua **cùng một thủ tục**: ngưỡng max-F1 và ngưỡng precision ≥ 0.9 chọn trên val, isotonic calibrate trên val. Nhờ vậy số so được trực tiếp với E2 (macro-F1) và E5 (macro-F1 @precision). Cặp chưa xác minh (−1) được coi là negative yếu với trọng số `unknown_weight`; giá trị này chọn trên val cùng L2. Nếu giá trị chọn được nằm ở biên lưới, log và SUMMARY sẽ cảnh báo. Bootstrap ghép cặp cho các bậc `--ladder` (mặc định: lp_clip − zs_clip, lp_dino − lp_clip, fused_learned − lp_clip, fused_learned − e5_per_tag).

Artifacts: `decisions.npz` → nguồn tag cho E6; `probes.npz` + `probes.json` (W, b, mean, std, ngưỡng).

### Part 5c — `export_tags`: đưa 174 nhãn vào app

```fish
uv run python -m experiments export_tags          # → app/tagging/probes/oi-lp_clip.npz (~390 KB, commit)
```

App chỉ có vector CLIP của mọi ảnh, nên chỉ xuất `lp_clip` (test mAP 0.940, so với 0.950 của `fused_learned` cần thêm DINO + YOLO). **Không** xuất thẳng probe của `probe`: run đó chọn `unknown_weight = 0` theo mAP trên cặp *đã xác minh*. Trên ảnh bất kỳ, probe ấy gắn khoảng 26 nhãn mỗi ảnh ("Remote control" xuất hiện ở 96% ảnh test), vì Open Images chủ yếu xác minh các nhãn "có khả năng". Thước đo trên cặp đã xác minh không thấy được lỗi này.

`export_tags` train lại theo giả định **thế giới mở**: cặp chưa xác minh được coi là negative (`--unknown-weight 1`). L2 chọn theo mAP thế giới mở trên val. Ngưỡng mỗi lớp lấy precision ≥ 0.9 trên val (lớp không đạt thì không tự gắn), calibrate isotonic trên val. Đọc feature từ cache của `probe`, không encode lại, chạy khoảng 1 phút trên CPU.

Kết quả lần xuất 2026-11-08 trên test:

| | đã xác minh | thế giới mở |
|---|---|---|
| mAP | 0.922 | 0.734 |
| precision tại ngưỡng app | 0.964 | 0.891 |

Trung bình 1.5 nhãn mỗi ảnh (trung vị 1). Precision thế giới mở là **cận dưới**, vì vài positive thật chưa được xác minh nên bị tính là sai. Hai giao thức đánh giá khác nhau đáng đưa vào luận văn.

## Part 6 — E6 search lai

```fish
uv run python -m experiments e6
```

Gồm các cấu hình: `clip`, `filter` (lọc cứng), `boost` (cos + λ·tỉ lệ tag 0/1 khớp) và `boost_prob` (cos + λ·trung bình **xác suất** đã calibrate của các lớp query nhắc tới). Tag lấy từ các nguồn `yolo` / `clip` / `fused` (E5, không train), `lp_clip` / `lp_dino` / `lp_clip_dino` / `fused_learned` (`probe`, có train) và **`oracle`**. Nguồn nào chưa có run thì bị bỏ, có ghi log. `boost_prob` cần chạy lại E5 bản mới (E5 cũ chưa lưu xác suất của yolo/clip). λ được chọn trên caption **val** cho từng (cấu hình, nguồn); lưới mặc định bắt đầu từ 0.005, và λ rơi vào biên lưới sẽ bị cảnh báo.

**`oracle` = trần**: tag lấy từ nhãn người xác minh của Open Images (tag hoàn hảo). Nó cho biết tag giúp search *tối đa* được bao nhiêu, để đọc các nguồn thật là "lấy được bao nhiêu % khoảng cách tới trần". Oracle không phải model nên SUMMARY/REPORT ghi `(trần)` và không tính vào "tốt nhất". Nhãn chưa xác minh (−1) bị tính là không có tag, nên trần này hơi thấp hơn trần thật; `result.json → oracle_named_pairs` ghi tỉ lệ đó. Chỉ chạy oracle thì không cần run E5:

```fish
uv run python -m experiments e6 --sources oracle --query-sets captions   # đo trần trước, vài phút
uv run python -m experiments e6                                         # đủ nguồn (cần E5)
```

Với query ghép, oracle đưa thêm ảnh mới vào top 20 → cần chấm thêm trong `judge.html` như E3c.

Bộ query gồm caption Localized Narratives (các lớp "được nhắc tới" lấy bằng cách khớp chữ trong caption, không nhìn nhãn ảnh) và query ghép (cột `classes` trong queries.csv, chấm tay qua pool như E3c). Bảng `captions.csv` tách riêng nhóm `named_*`, tức các query có nhắc ít nhất một lớp, và có CI cho ΔMRR so với `clip`.

---

## Thứ tự chạy đề xuất

```fish
uv run python -m experiments status
uv run python -m experiments select            # → sửa mapping nếu báo lỗi → tải ảnh
uv run python -m experiments build
uv run python -m experiments e1
uv run python -m experiments e2 --smoke 100; and uv run python -m experiments e4 --smoke 100; \
  and uv run python -m experiments e5 --smoke 100; and uv run python -m experiments e6 --smoke 100
uv run python -m experiments e2
uv run python -m experiments e3 --parts a b c
uv run python -m experiments e4
uv run python -m experiments e5
uv run python -m experiments e6 --sources oracle --query-sets captions   # trần, trước khi train
uv run python -m experiments select --splits train; and …tải ảnh…; and uv run python -m experiments build --splits train
uv run python -m experiments probe
uv run python -m experiments yolo_ft          # train lâu nhất — nên chạy qua đêm
uv run python -m experiments e6               # → chấm judge.html → chạy lại e3 --parts c và e6
uv run python -m experiments e3 --parts d     # TẠM HOÃN — khi có UIT-OpenViIC
```

## Files

| File | Vai trò |
|---|---|
| `core.py` | đường dẫn, tham số dataclass (→ CLI + JSON schema), `Run` (status/events/result) |
| `oi_data.py` | đọc annotation OI, resolve lớp + cây phân cấp, chọn subset, nhãn có mask |
| `prepare.py` | `select`, `build`, `status` |
| `features.py` | CLIP / YOLO bằng provider của app, tiền xử lý backend, cache |
| `metrics.py` | AP có mask, ngưỡng theo precision target, ECE, isotonic, retrieval, detection AP (group-of), bootstrap |
| `judging.py` | pool chấm tay + judge.html |
| `e1_sanity.py` … `e6_hybrid.py` | từng thí nghiệm |
| `data/oi_classes.csv` · `data/queries.csv` · `data/e1_published.json` | mapping lớp, query ghép, số công bố |

Test: `uv run pytest tests/test_experiments.py` (dữ liệu tổng hợp, chạy cả chuỗi E2→E6 với feature giả).
