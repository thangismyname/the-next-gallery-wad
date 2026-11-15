# Tóm tắt thực nghiệm AI — v005

Cập nhật 2026-11-08 01:23 · kích hoạt bởi `e6/20261108-012307` · dữ liệu `map=6f06806690 val=3000 tes=5000`

_File tự sinh sau mỗi run chính thức E1–E6. Bảng đầy đủ: `REPORT.md` (vi) / `REPORT.en.md` (en). Các version cũ: `History/summary/`._

**Đọc số:** precision = trong ảnh model gắn tag, bao nhiêu % đúng · recall = tìm ra bao nhiêu % ảnh đúng · F1 = cân bằng hai cái · mAP = ảnh đúng có xếp ở đầu không · ECE = độ tin cậy có khớp thực tế không (gần 0 tốt) · R@10 = ảnh đúng có trong top 10 · MRR = ảnh đúng thường đứng thứ mấy (1 = luôn đầu). Tất cả 0–1, càng cao càng tốt (trừ ECE).

**Dữ liệu:** Open Images V7, 174 lớp (128 vật thể + 46 cảnh); val 3.000 ảnh để *chọn* prompt/ngưỡng/quy tắc, test 5.000 ảnh để *báo cáo* 1 lần; nhãn do người kiểm tra, cặp chưa kiểm tra bị bỏ khỏi phép tính.

## Thay đổi so với v004

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
| E3c query ghép P@10 (tiếng Anh) | 0.530 | 0.530 | = |
| E3c query ghép P@10 (tiếng Việt, CLIP app) | 0.060 | 0.060 | = |
| E3c query ghép P@10 (tiếng Việt, CLIP đa ngữ) | 0.522 | 0.522 | = |
| E4 YOLO vẽ khung mAP@0.5 | 0.638 | 0.638 | = |
| E4 tag YOLO macro-F1 | 0.829 | 0.829 | = |
| E5 macro-F1 gộp theo tag | 0.764 | 0.764 | = |
| E5 macro-F1 chỉ CLIP | 0.691 | 0.691 | = |
| E5 macro-F1 chỉ YOLO | 0.346 | 0.346 | = |
| E5 macro-F1 luôn OR | 0.764 | 0.764 | = |
| Probe mAP zs_clip | 0.884 | 0.884 | = |
| Probe macro-F1@P zs_clip | 0.700 | 0.700 | = |
| Probe mAP e5_per_tag | 0.888 | 0.888 | = |
| Probe macro-F1@P e5_per_tag | 0.764 | 0.764 | = |
| Probe mAP lp_clip | 0.938 | 0.938 | = |
| Probe macro-F1@P lp_clip | 0.803 | 0.803 | = |
| Probe mAP lp_dino | 0.929 | 0.929 | = |
| Probe macro-F1@P lp_dino | 0.783 | 0.783 | = |
| Probe mAP lp_clip_dino | 0.943 | 0.943 | = |
| Probe macro-F1@P lp_clip_dino | 0.820 | 0.820 | = |
| Probe mAP fused_learned | 0.950 | 0.950 | = |
| Probe macro-F1@P fused_learned | 0.820 | 0.820 | = |
| E6 MRR CLIP thuần | 0.361 | 0.361 | = |
| E6 MRR boost tốt nhất | – | 0.373 | mới |
| E6 MRR trần (boost oracle) | 0.382 | 0.382 | = |

## Kết luận nhanh

1. Pipeline CLIP: phần ảnh đúng, phần chữ lệch nhẹ so với paper
2. CLIP gắn tag: mAP 0.884, độ tin cậy sau calibrate tốt (ECE 0.031)
3. Gộp YOLO + CLIP: macro-F1 0.764 vs chỉ CLIP 0.691 / chỉ YOLO 0.346
4. Query ghép: P@10 0.530 (tiếng Anh); tiếng Việt cần CLIP đa ngữ (0.060 → 0.522)
5. Tag có train: mAP zero-shot 0.884 → fused_learned 0.950
6. Tag cho search: chỉ nên cộng điểm nhẹ, không lọc cứng

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

<sub>run `20261108-004427`</sub>

_Mỗi tag thử 4 cách — chỉ CLIP, chỉ YOLO, OR (1 trong 2 nói có), AND (cả 2 cùng nói có) — chọn cách F1 cao nhất trên val mà vẫn giữ precision ≥ 90%._

- macro-F1 (cả 174 lớp): chỉ YOLO **0.346** · chỉ CLIP **0.691** · vật thể→YOLO/cảnh→CLIP **0.743** · **gộp theo tag 0.764** · luôn OR 0.765

- Gộp theo tag vs chỉ CLIP: +0.069 … +0.082 → **tốt hơn thật** (CI không chứa 0)

- Gộp theo tag vs chỉ YOLO (lớp YOLO biết): +0.037 … +0.058 → **tốt hơn thật** (CI không chứa 0)

- Lớp YOLO biết (81): chọn OR 34, CLIP 19, YOLO 16, AND 12 → **OR** thắng nhiều nhất; lớp YOLO không biết luôn dùng CLIP.

**Nghĩa là:** gộp hai model tốt hơn rõ rệt so với dùng riêng từng model. Lưu ý trung thực: chỉ cần **luôn OR** cũng đạt ngang chọn theo tag → giá trị nằm ở *việc gộp* hai nguồn, chọn quy tắc riêng từng tag chưa thêm lợi ích rõ. F1 ở đây thấp hơn E2 vì bắt precision ≥ 90% (ưu tiên ít gắn sai hơn gắn đủ — hợp lý cho app).

## Probe — Tag có train (linear probe) tốt hơn zero-shot bao nhiêu?

<sub>run `20261108-004647`</sub>

_Học 1 lớp tuyến tính trên feature app đã lưu (CLIP, DINOv3, YOLO) bằng 15.000 ảnh train; chọn siêu tham số / ngưỡng trên val, báo cáo test 1 lần. Hai mốc không train (zero-shot E2, quy tắc E5) đo cùng cách._

- CLIP zero-shot (E2): mAP **0.884** · macro-F1 0.826 · macro-F1 @precision ≥ 90% **0.700** · ECE 0.031

- quy tắc chọn tay (E5): mAP **0.888** · macro-F1 0.848 · macro-F1 @precision ≥ 90% **0.764** · ECE 0.026

- probe CLIP: mAP **0.938** · macro-F1 0.868 · macro-F1 @precision ≥ 90% **0.803** · ECE 0.023

- probe DINO: mAP **0.929** · macro-F1 0.860 · macro-F1 @precision ≥ 90% **0.783** · ECE 0.021

- probe CLIP+DINO: mAP **0.943** · macro-F1 0.876 · macro-F1 @precision ≥ 90% **0.820** · ECE 0.018

- fusion có học CLIP+DINO+YOLO: mAP **0.950** · macro-F1 0.876 · macro-F1 @precision ≥ 90% **0.820** · ECE 0.021

- train (cùng feature CLIP) vs zero-shot: Δ mAP +0.050 … +0.060 → **tốt hơn thật** (CI không chứa 0)

- DINO vs CLIP (cùng có train): Δ mAP -0.014 … -0.004 → **kém hơn thật** (CI không chứa 0)

- thêm nguồn độc lập (DINO + YOLO) vs chỉ CLIP: Δ mAP +0.009 … +0.016 → **tốt hơn thật** (CI không chứa 0)

- fusion có học vs quy tắc chọn tay (E5): Δ mAP +0.054 … +0.068 → **tốt hơn thật** (CI không chứa 0)

- ⚠️ siêu tham số nằm ở biên lưới: {'lp_clip': ['unknown_weight'], 'lp_clip_dino': ['l2', 'unknown_weight'], 'fused_learned': ['unknown_weight']} — mở rộng lưới rồi chạy lại.

**Nghĩa là:** train giúp rõ ở: train (cùng feature CLIP) vs zero-shot, thêm nguồn độc lập (DINO + YOLO) vs chỉ CLIP, fusion có học vs quy tắc chọn tay (E5).

## E6 — Tag có giúp tìm kiếm không? (RQ2)

<sub>run `20261108-012307`</sub>

_Khi câu tìm kiếm nhắc tới 1 lớp: **lọc cứng** (chỉ giữ ảnh có tag) hoặc **cộng điểm nhẹ** (ảnh có tag được cộng thêm chút điểm)._

- Cộng điểm bằng tag **yolo**: MRR 0.361 → **0.370** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **clip**: MRR 0.361 → **0.361** → chưa chắc khác (CI chứa 0)

- Cộng điểm bằng tag **fused**: MRR 0.361 → **0.364** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **lp_clip**: MRR 0.361 → **0.362** → chưa chắc khác (CI chứa 0)

- Cộng điểm bằng tag **lp_dino**: MRR 0.361 → **0.368** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **lp_clip_dino**: MRR 0.361 → **0.365** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **fused_learned**: MRR 0.361 → **0.367** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **yolo**: MRR 0.361 → **0.373** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **clip**: MRR 0.361 → **0.360** → chưa chắc khác (CI chứa 0)

- Cộng điểm theo xác suất bằng tag **fused**: MRR 0.361 → **0.363** → chưa chắc khác (CI chứa 0)

- Cộng điểm theo xác suất bằng tag **lp_clip**: MRR 0.361 → **0.364** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **lp_dino**: MRR 0.361 → **0.372** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **lp_clip_dino**: MRR 0.361 → **0.370** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **fused_learned**: MRR 0.361 → **0.372** → **tốt hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **yolo**: MRR 0.361 → **0.346** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **clip**: MRR 0.361 → **0.275** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **fused**: MRR 0.361 → **0.291** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **lp_clip**: MRR 0.361 → **0.300** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **lp_dino**: MRR 0.361 → **0.302** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **lp_clip_dino**: MRR 0.361 → **0.295** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **fused_learned**: MRR 0.361 → **0.305** → **kém hơn thật** (CI không chứa 0)

- **Trần (tag hoàn hảo = nhãn thật, cộng điểm)**: MRR 0.361 → **0.382** (+0.021) · nguồn tốt nhất (boost_prob yolo) đã lấy được **57%** khoảng cách tới trần · lớp caption nhắc tới: ảnh đích positive 66%, chưa xác minh 32% (trần thật cao hơn chút)

**Nghĩa là:** tag giúp search **một chút** khi dùng để cộng điểm; lọc cứng luôn làm tệ hơn (tag sai một lần là ảnh đúng bị loại hẳn) → dùng tag để *ưu tiên*, không để *lọc*. Query ghép chưa có số (còn 401 cặp chưa chấm).

## Lịch sử version

| version | lúc | kích hoạt bởi | E2 tag CLIP mAP | E3a tìm theo tên lớp mAP | E4 YOLO vẽ khung mAP@0.5 | E5 macro-F1 gộp theo tag | E6 MRR boost tốt nhất | E3c query ghép P@10 (tiếng Anh) |
|---|---|---|---|---|---|---|---|---|
| v005 | 2026-11-08 01:23 | e6/20261108-012307 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v004 | 2026-11-08 01:23 | probe/20261108-004647 | 0.884 | 0.877 | 0.638 | 0.764 | – | 0.530 |
| v003 | 2026-11-07 23:36 | e6/20261107-233600 | 0.884 | 0.877 | 0.638 | 0.764 | – | 0.530 |
| v002 | 2026-11-07 23:13 | manual | 0.884 | 0.877 | 0.638 | 0.764 | 0.370 | 0.530 |
| v001 | 2026-11-07 22:00 | manual | 0.884 | 0.877 | 0.638 | 0.764 | 0.370 | – |
