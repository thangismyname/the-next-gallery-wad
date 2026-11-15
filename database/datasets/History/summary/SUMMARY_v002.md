# Tóm tắt thực nghiệm AI — v002

Cập nhật 2026-11-07 23:13 · kích hoạt bởi `manual` · dữ liệu `map=6f06806690 val=3000 tes=5000`

_File tự sinh sau mỗi run chính thức E1–E6. Bảng đầy đủ: `REPORT.md` (vi) / `REPORT.en.md` (en). Các version cũ: `History/summary/`._

**Đọc số:** precision = trong ảnh model gắn tag, bao nhiêu % đúng · recall = tìm ra bao nhiêu % ảnh đúng · F1 = cân bằng hai cái · mAP = ảnh đúng có xếp ở đầu không · ECE = độ tin cậy có khớp thực tế không (gần 0 tốt) · R@10 = ảnh đúng có trong top 10 · MRR = ảnh đúng thường đứng thứ mấy (1 = luôn đầu). Tất cả 0–1, càng cao càng tốt (trừ ECE).

**Dữ liệu:** Open Images V7, 174 lớp (128 vật thể + 46 cảnh); val 3.000 ảnh để *chọn* prompt/ngưỡng/quy tắc, test 5.000 ảnh để *báo cáo* 1 lần; nhãn do người kiểm tra, cặp chưa kiểm tra bị bỏ khỏi phép tính.

## Thay đổi so với v001

| metric | trước | bây giờ | thay đổi |
|---|---|---|---|
| E1 Flickr câu→ảnh R@1 (%) | 65.160 | 65.160 | = |
| E1 Flickr ảnh→câu R@1 (%) | 88.300 | 88.300 | = |
| E1 COCO câu→ảnh R@1 (%) | 35.670 | 35.670 | = |
| E1 COCO ảnh→câu R@1 (%) | 59.080 | 59.080 | = |
| E2 tag CLIP mAP | 0.884 | 0.884 | = |
| E2 tag CLIP macro-F1 | 0.826 | 0.826 | = |
| E2 ECE sau calibrate | 0.031 | 0.031 | = |
| E3a tìm theo tên lớp mAP | 0.877 | 0.877 | = |
| E3b tìm bằng câu dài R@10 | 0.593 | 0.593 | = |
| E3b MRR | 0.361 | 0.361 | = |
| E3c query ghép P@10 (tiếng Anh) | – | 0.530 | mới |
| E3c query ghép P@10 (tiếng Việt, CLIP app) | – | 0.060 | mới |
| E3c query ghép P@10 (tiếng Việt, CLIP đa ngữ) | – | 0.522 | mới |
| E4 YOLO vẽ khung mAP@0.5 | 0.638 | 0.638 | = |
| E4 tag YOLO macro-F1 | 0.829 | 0.829 | = |
| E5 macro-F1 gộp theo tag | 0.764 | 0.764 | = |
| E5 macro-F1 chỉ CLIP | 0.691 | 0.691 | = |
| E5 macro-F1 chỉ YOLO | 0.346 | 0.346 | = |
| E5 macro-F1 luôn OR | 0.764 | 0.764 | = |
| E6 MRR CLIP thuần | 0.361 | 0.361 | = |
| E6 MRR boost tốt nhất | 0.370 | 0.370 | = |
| E6 query ghép P@10 CLIP thuần | – | 0.530 | mới |
| E6 query ghép P@10 boost tốt nhất | – | 0.545 | mới |
| E6 query ghép P@10 lọc cứng tốt nhất | – | 0.542 | mới |

## Kết luận nhanh

1. Pipeline CLIP: phần ảnh đúng, phần chữ lệch nhẹ so với paper
2. CLIP gắn tag: mAP 0.884, độ tin cậy sau calibrate tốt (ECE 0.031)
3. Gộp YOLO + CLIP: macro-F1 0.764 vs chỉ CLIP 0.691 / chỉ YOLO 0.346
4. Query ghép: P@10 0.530 (tiếng Anh); tiếng Việt cần CLIP đa ngữ (0.060 → 0.522)
5. Tag cho search: chỉ nên cộng điểm nhẹ, không lọc cứng

## E1 — Pipeline CLIP có đúng không?

<sub>run `20261107-034923`</sub>

_Chạy lại đúng CLIP của paper (ViT-L/14@336px) trên Flickr30k và COCO, so với số paper công bố (Table 13). Lệch quá 2 điểm R@1 thì có thể code sai._

- **Flickr30k**: câu→ảnh R@1 **65.2** (paper 68.7, lệch -3.5) · ảnh→câu R@1 **88.3** (paper 88.0, lệch 0.3) → ❌ lệch

- **COCO 5K**: câu→ảnh R@1 **35.7** (paper 37.8, lệch -2.1) · ảnh→câu R@1 **59.1** (paper 58.4, lệch 0.7) → ❌ lệch

**Nghĩa là:** Chiều ảnh→câu khớp paper nên phần xử lý **ảnh** đúng; chỉ chiều câu→ảnh lệch → khác biệt nằm ở phía **chữ** (cách xử lý caption / tiền tố prompt), không phải lỗi encode ảnh. Ảnh đi qua pipeline app (WebP ≤512 px) chỉ thay đổi R@1 tối đa 1.0 điểm → cách app nén ảnh không làm hỏng chất lượng.

## E2 — CLIP tự gắn tag tốt đến đâu? (RQ1)

<sub>run `20261107-033218`</sub>

_Mỗi lớp: so ảnh với câu prompt → điểm; ngưỡng riêng từng lớp chọn trên val; calibrate để điểm thành xác suất đáng tin. Báo cáo trên 5.000 ảnh test._

- Prompt tốt nhất (chọn trên val): `a photo containing a {}.`

- mAP **0.884** (CI95 0.875–0.889) · macro-F1 **0.826**

- Cảnh **0.943** vs vật thể **0.863** (cảnh dễ hơn — cảnh chiếm cả ảnh, vật thể có thể rất nhỏ)

- Độ tin cậy (ECE, càng gần 0 càng tốt): **0.148 → 0.031** sau calibrate

**Nghĩa là:** CLIP gắn tag tốt; sau calibrate, khi app báo "85% là biển" thì con số đó gần đúng thật — đáp ứng yêu cầu tag kèm độ tin cậy.

## E3 — CLIP tìm ảnh tốt đến đâu? (RQ1)

<sub>run `20261107-231117`</sub>

- **(a) Gõ tên lớp** (vd "dog"): mAP **0.878**, trung bình **9.5/10** ảnh đầu là đúng. Nếu coi ảnh *chưa ai kiểm tra* là sai thì mAP chỉ 0.650 — khoảng cách 0.227 phần lớn do **nhãn Open Images thiếu**, không phải model kém (xem tay `a_fp_review.csv`).

- **(b) Gõ câu mô tả dài** (mỗi câu chỉ đúng 1 ảnh trong 5.000): ảnh đúng đứng đầu **25%** số lần, lọt top 10 **59%**, MRR 0.361. Chỉ dùng câu đầu: MRR 0.272 (vs 0.361) → mô tả càng chi tiết càng dễ tìm.

- **(c) Query ghép** (vd "dog on a beach", 40 query, chấm tay top 20): trung bình **5.3/10** ảnh đầu là đúng (P@10 0.530, nDCG@10 0.657). Khó hơn hẳn gõ 1 tên lớp (0.949) vì phải đúng *cả hai* ý cùng lúc.

- **Cùng query bằng tiếng Việt**: CLIP của app chỉ được **0.060** (gần như đoán bừa — model chỉ học tiếng Anh); đổi sang CLIP đa ngữ lên **0.522** ≈ tiếng Anh → muốn tìm bằng tiếng Việt phải dùng CLIP đa ngữ (hoặc dịch query sang tiếng Anh trước).

- **(d) Tiếng Việt**: tạm hoãn.

## E4 — YOLO26 tốt đến đâu?

<sub>run `20261107-033725`</sub>

- YOLO chỉ biết **81/174** lớp — 93 lớp còn lại (cảnh, hoa, toà nhà, món ăn ngoài COCO…) chỉ CLIP lấp được.

- Tìm + vẽ khung: mAP@0.5 **0.638** (đồ vật nhỏ / bị che như dao, nĩa, sách thường kém — xem REPORT.md).

- Dùng làm tag: mAP **0.897** · ngưỡng chọn trên val macro-F1 **0.829** vs ngưỡng mặc định app (0.25) 0.799

**Nghĩa là:** ngưỡng riêng từng lớp tốt hơn ngưỡng chung của app → gợi ý chỉnh `AI_YOLO_CONF` / dùng ngưỡng theo lớp.

## E5 — Gộp YOLO + CLIP có tốt hơn? (RQ2 · kết quả chính C1)

<sub>run `20261107-034838`</sub>

_Mỗi tag thử 4 cách — chỉ CLIP, chỉ YOLO, OR (1 trong 2 nói có), AND (cả 2 cùng nói có) — chọn cách F1 cao nhất trên val mà vẫn giữ precision ≥ 90%._

- macro-F1 (cả 174 lớp): chỉ YOLO **0.346** · chỉ CLIP **0.691** · vật thể→YOLO/cảnh→CLIP **0.743** · **gộp theo tag 0.764** · luôn OR 0.765

- Gộp theo tag vs chỉ CLIP: +0.069 … +0.082 → **tốt hơn thật** (CI không chứa 0)

- Gộp theo tag vs chỉ YOLO (lớp YOLO biết): +0.037 … +0.058 → **tốt hơn thật** (CI không chứa 0)

- Lớp YOLO biết (81): chọn OR 34, CLIP 19, YOLO 16, AND 12 → **OR** thắng nhiều nhất; lớp YOLO không biết luôn dùng CLIP.

**Nghĩa là:** gộp hai model tốt hơn rõ rệt so với dùng riêng từng model. Lưu ý trung thực: chỉ cần **luôn OR** cũng đạt ngang chọn theo tag → giá trị nằm ở *việc gộp* hai nguồn, chọn quy tắc riêng từng tag chưa thêm lợi ích rõ. F1 ở đây thấp hơn E2 vì bắt precision ≥ 90% (ưu tiên ít gắn sai hơn gắn đủ — hợp lý cho app).

## E6 — Tag có giúp tìm kiếm không? (RQ2)

<sub>run `20261107-231158`</sub>

_Khi câu tìm kiếm nhắc tới 1 lớp: **lọc cứng** (chỉ giữ ảnh có tag) hoặc **cộng điểm nhẹ** (ảnh có tag được cộng thêm chút điểm)._

- Cộng điểm bằng tag **yolo**: MRR 0.361 → **0.370** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **clip**: MRR 0.361 → **0.356** → **kém hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **fused**: MRR 0.361 → **0.364** → **tốt hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **yolo**: MRR 0.361 → **0.346** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **clip**: MRR 0.361 → **0.275** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **fused**: MRR 0.361 → **0.291** → **kém hơn thật** (CI không chứa 0)

- **Query ghép** (40 query, chấm tay, P@10 — CLIP thuần **0.530**): lọc yolo 0.542 · cộng điểm yolo 0.545 · lọc clip 0.465 · cộng điểm clip 0.525 · lọc fused 0.512 · cộng điểm fused 0.543

**Nghĩa là:** tag giúp search **một chút** khi dùng để cộng điểm; lọc cứng luôn làm tệ hơn (tag sai một lần là ảnh đúng bị loại hẳn) → dùng tag để *ưu tiên*, không để *lọc*. Với query ghép, tốt nhất là cộng điểm bằng tag yolo (+0.015 P@10 ≈ 6 ảnh đúng thêm trên 400 ô top-10) — chênh nhỏ và chỉ có 40 query nên coi là *xu hướng*, chưa phải kết luận chắc; tag CLIP lọc cứng vẫn làm tệ hơn, khớp với kết quả caption.

## Lịch sử version

| version | lúc | kích hoạt bởi | E2 tag CLIP mAP | E3a tìm theo tên lớp mAP | E4 YOLO vẽ khung mAP@0.5 | E5 macro-F1 gộp theo tag | E6 MRR boost tốt nhất | E3c query ghép P@10 (tiếng Anh) |
|---|---|---|---|---|---|---|---|---|
| v002 | 2026-11-07 23:13 | manual | 0.884 | 0.877 | 0.638 | 0.764 | 0.370 | 0.530 |
| v001 | 2026-11-07 22:00 | manual | 0.884 | 0.877 | 0.638 | 0.764 | 0.370 | – |
