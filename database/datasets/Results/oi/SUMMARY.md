# Tóm tắt thực nghiệm AI — v014

Cập nhật 2026-11-22 19:31 · kích hoạt bởi `e6/20261122-193042` · dữ liệu `map=6f06806690 val=3000 tes=5000`

_File tự sinh sau mỗi run chính thức E1–E6. Bảng đầy đủ: `REPORT.md` (vi) / `REPORT.en.md` (en). Các version cũ: `History/summary/`._

**Đọc số:** precision = trong ảnh model gắn tag, bao nhiêu % đúng · recall = tìm ra bao nhiêu % ảnh đúng · F1 = cân bằng hai cái · mAP = ảnh đúng có xếp ở đầu không · ECE = độ tin cậy có khớp thực tế không (gần 0 tốt) · R@10 = ảnh đúng có trong top 10 · MRR = ảnh đúng thường đứng thứ mấy (1 = luôn đầu). Tất cả 0–1, càng cao càng tốt (trừ ECE).

**Dữ liệu:** Open Images V7, 174 lớp (128 vật thể + 46 cảnh); val 3.000 ảnh để *chọn* prompt/ngưỡng/quy tắc, test 5.000 ảnh để *báo cáo* 1 lần; nhãn do người kiểm tra, cặp chưa kiểm tra bị bỏ khỏi phép tính.

## Thay đổi so với v013

| metric | trước | bây giờ | thay đổi |
|---|---|---|---|
| E1 Flickr câu→ảnh R@1 (%) | 67.420 | 67.420 | = |
| E1 Flickr ảnh→câu R@1 (%) | 87.400 | 87.400 | = |
| E1 COCO câu→ảnh R@1 (%) | 36.470 | 36.470 | = |
| E1 COCO ảnh→câu R@1 (%) | 58.940 | 58.940 | = |
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
| YOLO-FT tag mAP base coco | 0.897 | 0.897 | = |
| YOLO-FT tag mAP ft coco | 0.882 | 0.882 | = |
| YOLO-FT tag mAP ft gap | 0.789 | 0.789 | = |
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
| Probe macro-F1@P fused_learned | 0.829 | 0.829 | = |
| E6 MRR CLIP thuần | 0.361 | 0.361 | = |
| E6 MRR boost tốt nhất | 0.373 | 0.373 | = |
| E6 MRR trần (boost oracle) | 0.382 | 0.382 | = |
| E6 query ghép P@10 CLIP thuần | – | 0.530 | mới |
| E6 query ghép P@10 boost tốt nhất | – | 0.562 | mới |
| E6 query ghép P@10 lọc cứng tốt nhất | – | 0.590 | mới |

## Kết luận nhanh

1. Pipeline CLIP: ✅ khớp paper
2. CLIP gắn tag: mAP 0.884, độ tin cậy sau calibrate tốt (ECE 0.031)
3. Gộp YOLO + CLIP: macro-F1 0.764 vs chỉ CLIP 0.691 / chỉ YOLO 0.346
4. Query ghép: P@10 0.530 (tiếng Anh); tiếng Việt cần CLIP đa ngữ (0.060 → 0.522)
5. Tag có train: mAP zero-shot 0.884 → fused_learned 0.950
6. Tag cho search: caption dài → chỉ nên cộng điểm nhẹ, không lọc cứng; query ghép ngắn → lọc bằng tag fused_learned tốt nhất (P@10 0.590)

## E1 — Pipeline CLIP có đúng không?

<sub>run `20261120-111931`</sub>

_Chạy lại đúng CLIP của paper (ViT-L/14@336px) trên Flickr30k và COCO, so với số paper công bố (Table 13). Lệch quá 2 điểm R@1 thì có thể code sai._

- **Flickr30k**: câu→ảnh R@1 **67.4** (paper 68.7, lệch -1.3) · ảnh→câu R@1 **87.4** (paper 88.0, lệch -0.6) → ✅ đạt

- **COCO 5K**: câu→ảnh R@1 **36.5** (paper 37.8, lệch -1.3) · ảnh→câu R@1 **58.9** (paper 58.4, lệch 0.5) → ✅ đạt

**Nghĩa là:** Pipeline tái lập đúng paper → các kết quả CLIP phía sau đáng tin. Ảnh đi qua pipeline app (WebP ≤512 px) chỉ thay đổi R@1 tối đa 1.0 điểm → cách app nén ảnh không làm hỏng chất lượng.

## E2 — CLIP tự gắn tag tốt đến đâu? (RQ1)

<sub>run `20261120-115528`</sub>

_Mỗi lớp: so ảnh với câu prompt → điểm; ngưỡng riêng từng lớp chọn trên val; calibrate để điểm thành xác suất đáng tin. Báo cáo trên 5.000 ảnh test._

- Prompt tốt nhất (chọn trên val): `a photo containing a {}.`

- mAP **0.884** (CI95 0.875–0.889) · macro-F1 **0.826**

- Cảnh **0.943** vs vật thể **0.863** (cảnh dễ hơn — cảnh chiếm cả ảnh, vật thể có thể rất nhỏ)

- Độ tin cậy (ECE, càng gần 0 càng tốt): **0.148 → 0.031** sau calibrate

**Nghĩa là:** CLIP gắn tag tốt; sau calibrate, khi app báo "85% là biển" thì con số đó gần đúng thật — đáp ứng yêu cầu tag kèm độ tin cậy.

## E3 — CLIP tìm ảnh tốt đến đâu? (RQ1)

<sub>run `20261120-115544`</sub>

- **(a) Gõ tên lớp** (vd "dog"): mAP **0.878**, trung bình **9.5/10** ảnh đầu là đúng. Nếu coi ảnh *chưa ai kiểm tra* là sai thì mAP chỉ 0.650 — khoảng cách 0.227 phần lớn do **nhãn Open Images thiếu**, không phải model kém (xem tay `a_fp_review.csv`).

- **(b) Gõ câu mô tả dài** (mỗi câu chỉ đúng 1 ảnh trong 5.000): ảnh đúng đứng đầu **25%** số lần, lọt top 10 **59%**, MRR 0.361. Chỉ dùng câu đầu: MRR 0.272 (vs 0.361) → mô tả càng chi tiết càng dễ tìm.

- **(c) Query ghép** (vd "dog on a beach", 40 query, chấm tay top 20): trung bình **5.3/10** ảnh đầu là đúng (P@10 0.530, nDCG@10 0.641). Khó hơn hẳn gõ 1 tên lớp (0.949) vì phải đúng *cả hai* ý cùng lúc.

- **Cùng query bằng tiếng Việt**: CLIP của app chỉ được **0.060** (gần như đoán bừa — model chỉ học tiếng Anh); đổi sang CLIP đa ngữ lên **0.522** ≈ tiếng Anh → muốn tìm bằng tiếng Việt phải dùng CLIP đa ngữ (hoặc dịch query sang tiếng Anh trước).

- **(d) Tiếng Việt**: tạm hoãn.

## E4 — YOLO26 tốt đến đâu?

<sub>run `20261120-115621`</sub>

- YOLO chỉ biết **81/174** lớp — 93 lớp còn lại (cảnh, hoa, toà nhà, món ăn ngoài COCO…) chỉ CLIP lấp được.

- Tìm + vẽ khung: mAP@0.5 **0.638** (đồ vật nhỏ / bị che như dao, nĩa, sách thường kém — xem REPORT.md).

- Dùng làm tag: mAP **0.897** · ngưỡng chọn trên val macro-F1 **0.829** vs ngưỡng mặc định app (0.25) 0.799

**Nghĩa là:** ngưỡng riêng từng lớp tốt hơn ngưỡng chung của app → gợi ý chỉnh `AI_YOLO_CONF` / dùng ngưỡng theo lớp.

## YOLO-FT — Fine-tune YOLO trên Open Images lấp được khoảng trống không?

<sub>run `20261120-115827`</sub>

_YOLO26n (pretrain COCO, 81 lớp) được train tiếp trên box của 15.000 ảnh train cho 128 lớp vật thể; chọn epoch trên val, đo test 1 lần. So với model gốc theo cùng giao thức như E4._

- Vẽ khung AP@0.5 (giao thức OI): lớp COCO gốc **0.638** → fine-tune **0.614** · 47 lớp ngoài COCO: 0 → **0.419**

- Gắn tag (lớp COCO): mAP 0.897 → **0.882** · F1@P 0.761 → **0.747**; lớp ngoài COCO: mAP **0.789** · F1@P **0.549**

- Fine-tune − gốc trên lớp COCO (tag mAP): -0.028 … -0.005 → **kém hơn thật** (CI không chứa 0)

- Chi phí: base 36.0 ms/ảnh, 2.57M tham số · ft 25.3 ms/ảnh, 2.60M tham số

**Nghĩa là:** fine-tune làm **giảm** chất lượng trên lớp COCO (quên) — cân nhắc --freeze hoặc ít epoch hơn.

## E5 — Gộp YOLO + CLIP có tốt hơn? (RQ2 · kết quả chính C1)

<sub>run `20261120-121016`</sub>

_Mỗi tag thử 4 cách — chỉ CLIP, chỉ YOLO, OR (1 trong 2 nói có), AND (cả 2 cùng nói có) — chọn cách F1 cao nhất trên val mà vẫn giữ precision ≥ 90%._

- macro-F1 (cả 174 lớp): chỉ YOLO **0.346** · chỉ CLIP **0.691** · vật thể→YOLO/cảnh→CLIP **0.743** · **gộp theo tag 0.764** · luôn OR 0.765

- Gộp theo tag vs chỉ CLIP: +0.069 … +0.082 → **tốt hơn thật** (CI không chứa 0)

- Gộp theo tag vs chỉ YOLO (lớp YOLO biết): +0.037 … +0.058 → **tốt hơn thật** (CI không chứa 0)

- Lớp YOLO biết (81): chọn OR 34, CLIP 19, YOLO 16, AND 12 → **OR** thắng nhiều nhất; lớp YOLO không biết luôn dùng CLIP.

**Nghĩa là:** gộp hai model tốt hơn rõ rệt so với dùng riêng từng model. Lưu ý trung thực: chỉ cần **luôn OR** cũng đạt ngang chọn theo tag → giá trị nằm ở *việc gộp* hai nguồn, chọn quy tắc riêng từng tag chưa thêm lợi ích rõ. F1 ở đây thấp hơn E2 vì bắt precision ≥ 90% (ưu tiên ít gắn sai hơn gắn đủ — hợp lý cho app).

## Probe — Tag có train (linear probe) tốt hơn zero-shot bao nhiêu?

<sub>run `20261122-192438`</sub>

_Học 1 lớp tuyến tính trên feature app đã lưu (CLIP, DINOv3, YOLO) bằng 15.000 ảnh train; chọn siêu tham số / ngưỡng trên val, báo cáo test 1 lần. Hai mốc không train (zero-shot E2, quy tắc E5) đo cùng cách._

- CLIP zero-shot (E2): mAP **0.884** · macro-F1 0.826 · macro-F1 @precision ≥ 90% **0.700** · ECE 0.031

- quy tắc chọn tay (E5): mAP **0.888** · macro-F1 0.848 · macro-F1 @precision ≥ 90% **0.764** · ECE 0.026

- probe CLIP: mAP **0.938** · macro-F1 0.868 · macro-F1 @precision ≥ 90% **0.803** · ECE 0.023

- probe DINO: mAP **0.929** · macro-F1 0.860 · macro-F1 @precision ≥ 90% **0.783** · ECE 0.021

- probe CLIP+DINO: mAP **0.943** · macro-F1 0.876 · macro-F1 @precision ≥ 90% **0.820** · ECE 0.018

- fusion có học CLIP+DINO+YOLO: mAP **0.950** · macro-F1 0.877 · macro-F1 @precision ≥ 90% **0.829** · ECE 0.021

- train (cùng feature CLIP) vs zero-shot: Δ mAP +0.050 … +0.060 → **tốt hơn thật** (CI không chứa 0)

- DINO vs CLIP (cùng có train): Δ mAP -0.014 … -0.004 → **kém hơn thật** (CI không chứa 0)

- thêm nguồn độc lập (DINO + YOLO) vs chỉ CLIP: Δ mAP +0.008 … +0.016 → **tốt hơn thật** (CI không chứa 0)

- fusion có học vs quy tắc chọn tay (E5): Δ mAP +0.054 … +0.068 → **tốt hơn thật** (CI không chứa 0)

**Nghĩa là:** train giúp rõ ở: train (cùng feature CLIP) vs zero-shot, thêm nguồn độc lập (DINO + YOLO) vs chỉ CLIP, fusion có học vs quy tắc chọn tay (E5).

## E6 — Tag có giúp tìm kiếm không? (RQ2)

<sub>run `20261122-193042`</sub>

_Khi câu tìm kiếm nhắc tới 1 lớp: **lọc cứng** (chỉ giữ ảnh có tag) hoặc **cộng điểm nhẹ** (ảnh có tag được cộng thêm chút điểm)._

- Cộng điểm bằng tag **yolo**: MRR 0.361 → **0.370** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **clip**: MRR 0.361 → **0.361** → chưa chắc khác (CI chứa 0)

- Cộng điểm bằng tag **fused**: MRR 0.361 → **0.364** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **yolo_ft**: MRR 0.361 → **0.366** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **fused_ft**: MRR 0.361 → **0.363** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **lp_clip**: MRR 0.361 → **0.362** → chưa chắc khác (CI chứa 0)

- Cộng điểm bằng tag **lp_dino**: MRR 0.361 → **0.368** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **lp_clip_dino**: MRR 0.361 → **0.365** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm bằng tag **fused_learned**: MRR 0.361 → **0.367** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **yolo**: MRR 0.361 → **0.373** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **clip**: MRR 0.361 → **0.360** → chưa chắc khác (CI chứa 0)

- Cộng điểm theo xác suất bằng tag **fused**: MRR 0.361 → **0.363** → chưa chắc khác (CI chứa 0)

- Cộng điểm theo xác suất bằng tag **yolo_ft**: MRR 0.361 → **0.369** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **fused_ft**: MRR 0.361 → **0.366** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **lp_clip**: MRR 0.361 → **0.364** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **lp_dino**: MRR 0.361 → **0.372** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **lp_clip_dino**: MRR 0.361 → **0.370** → **tốt hơn thật** (CI không chứa 0)

- Cộng điểm theo xác suất bằng tag **fused_learned**: MRR 0.361 → **0.373** → **tốt hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **yolo**: MRR 0.361 → **0.346** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **clip**: MRR 0.361 → **0.275** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **fused**: MRR 0.361 → **0.291** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **yolo_ft**: MRR 0.361 → **0.323** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **fused_ft**: MRR 0.361 → **0.292** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **lp_clip**: MRR 0.361 → **0.300** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **lp_dino**: MRR 0.361 → **0.302** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **lp_clip_dino**: MRR 0.361 → **0.295** → **kém hơn thật** (CI không chứa 0)

- Lọc cứng bằng tag **fused_learned**: MRR 0.361 → **0.306** → **kém hơn thật** (CI không chứa 0)

- **Trần (tag hoàn hảo = nhãn thật, cộng điểm)**: MRR 0.361 → **0.382** (+0.021) · nguồn tốt nhất (boost_prob yolo) đã lấy được **57%** khoảng cách tới trần · lớp caption nhắc tới: ảnh đích positive 66%, chưa xác minh 32% (trần thật cao hơn chút)

- **Query ghép** (40 query, chấm tay, P@10 — CLIP thuần **0.530**): lọc yolo 0.542 · cộng điểm yolo 0.545 · cộng điểm (xác suất) yolo 0.562 · lọc clip 0.465 · cộng điểm clip 0.530 · cộng điểm (xác suất) clip 0.530 · lọc fused 0.512 · cộng điểm fused 0.543 · cộng điểm (xác suất) fused 0.550 · lọc yolo_ft 0.515 · cộng điểm yolo_ft 0.545 · cộng điểm (xác suất) yolo_ft 0.560 · lọc fused_ft 0.530 · cộng điểm fused_ft 0.542 · cộng điểm (xác suất) fused_ft 0.550 · lọc lp_clip 0.575 · cộng điểm lp_clip 0.542 · cộng điểm (xác suất) lp_clip 0.542 · lọc lp_dino 0.535 · cộng điểm lp_dino 0.550 · cộng điểm (xác suất) lp_dino 0.560 · lọc lp_clip_dino 0.537 · cộng điểm lp_clip_dino 0.542 · cộng điểm (xác suất) lp_clip_dino 0.560 · lọc fused_learned 0.590 · cộng điểm fused_learned 0.562 · cộng điểm (xác suất) fused_learned 0.562

- So sánh (caption, MRR): `boost_prob:fused_learned` 0.373 vs `boost_prob:yolo` 0.373 → Δ -0.000 (-0.004 … +0.004) → chưa chắc khác (CI chứa 0)

- So sánh (caption, MRR): `boost_prob:lp_clip` 0.364 vs `boost_prob:clip` 0.360 → Δ +0.004 (+0.001 … +0.007) → **tốt hơn thật** (CI không chứa 0)

- So sánh (caption, MRR): `boost_prob:lp_dino` 0.372 vs `boost_prob:lp_clip` 0.364 → Δ +0.009 (+0.006 … +0.011) → **tốt hơn thật** (CI không chứa 0)

- So sánh (caption, MRR): `boost_prob:fused_learned` 0.373 vs `boost_prob:lp_clip` 0.364 → Δ +0.009 (+0.006 … +0.012) → **tốt hơn thật** (CI không chứa 0)

- So sánh (caption, MRR): `boost_prob:fused_learned` 0.373 vs `boost:fused_learned` 0.367 → Δ +0.006 (+0.003 … +0.008) → **tốt hơn thật** (CI không chứa 0)

- So sánh (caption, MRR): `filter:fused_learned` 0.306 vs `boost_prob:fused_learned` 0.373 → Δ -0.067 (-0.073 … -0.061) → **kém hơn thật** (CI không chứa 0)

- So sánh (caption, MRR): `boost_prob:yolo_ft` 0.369 vs `boost_prob:yolo` 0.373 → Δ -0.003 (-0.007 … +0.001) → chưa chắc khác (CI chứa 0)

- So sánh (caption, MRR): `boost_prob:fused_ft` 0.366 vs `boost_prob:fused` 0.363 → Δ +0.003 (+0.000 … +0.006) → **tốt hơn thật** (CI không chứa 0)

- So sánh (query ghép, P@10): `boost_prob:fused_learned` 0.562 vs `boost_prob:yolo` 0.562 → Δ +0.000 (-0.024 … +0.025) → chưa chắc khác (CI chứa 0)

- So sánh (query ghép, P@10): `boost_prob:lp_clip` 0.542 vs `boost_prob:clip` 0.530 → Δ +0.013 (+0.000 … +0.025) → chưa chắc khác (CI chứa 0)

- So sánh (query ghép, P@10): `boost_prob:lp_dino` 0.560 vs `boost_prob:lp_clip` 0.542 → Δ +0.017 (+0.000 … +0.035) → chưa chắc khác (CI chứa 0)

- So sánh (query ghép, P@10): `boost_prob:fused_learned` 0.562 vs `boost_prob:lp_clip` 0.542 → Δ +0.020 (+0.000 … +0.045) → **tốt hơn thật** (CI không chứa 0)

- So sánh (query ghép, P@10): `boost_prob:fused_learned` 0.562 vs `boost:fused_learned` 0.562 → Δ -0.000 (-0.010 … +0.010) → chưa chắc khác (CI chứa 0)

- So sánh (query ghép, P@10): `filter:fused_learned` 0.590 vs `boost_prob:fused_learned` 0.562 → Δ +0.028 (-0.008 … +0.070) → chưa chắc khác (CI chứa 0)

- So sánh (query ghép, P@10): `boost_prob:yolo_ft` 0.560 vs `boost_prob:yolo` 0.562 → Δ -0.003 (-0.022 … +0.017) → chưa chắc khác (CI chứa 0)

- So sánh (query ghép, P@10): `boost_prob:fused_ft` 0.550 vs `boost_prob:fused` 0.550 → Δ -0.000 (-0.010 … +0.010) → chưa chắc khác (CI chứa 0)

**Nghĩa là:** tag giúp search **một chút** khi dùng để cộng điểm; với caption dài, lọc cứng luôn làm tệ hơn (tag sai một lần là ảnh đúng bị loại hẳn) → dùng tag để *ưu tiên*, không để *lọc*. Với query ghép, tốt nhất là lọc bằng tag fused_learned (+0.060 P@10, **tốt hơn thật** (CI không chứa 0)) — query ngắn nêu rõ lớp thì lọc bằng tag tốt *giúp*, khác với caption dài.

## Lịch sử version

| version | lúc | kích hoạt bởi | E2 tag CLIP mAP | E3a tìm theo tên lớp mAP | E4 YOLO vẽ khung mAP@0.5 | E5 macro-F1 gộp theo tag | E6 MRR boost tốt nhất | E3c query ghép P@10 (tiếng Anh) |
|---|---|---|---|---|---|---|---|---|
| v014 | 2026-11-22 19:31 | e6/20261122-193042 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v013 | 2026-11-20 12:20 | probe/20261120-121515 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v012 | 2026-11-20 11:55 | e1/20261120-111931 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v011 | 2026-11-12 14:04 | yolo_ft/20261109-100541 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v010 | 2026-11-09 10:05 | yolo_ft/20261108-224401 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v009 | 2026-11-08 17:59 | yolo_ft/20261108-021431 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v008 | 2026-11-08 01:58 | e6/20261108-015734 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v007 | 2026-11-08 01:55 | probe/20261108-014828 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v006 | 2026-11-08 01:48 | e6/20261108-014743 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v005 | 2026-11-08 01:23 | e6/20261108-012307 | 0.884 | 0.877 | 0.638 | 0.764 | 0.373 | 0.530 |
| v004 | 2026-11-08 01:23 | probe/20261108-004647 | 0.884 | 0.877 | 0.638 | 0.764 | – | 0.530 |
| v003 | 2026-11-07 23:36 | e6/20261107-233600 | 0.884 | 0.877 | 0.638 | 0.764 | – | 0.530 |
| v002 | 2026-11-07 23:13 | manual | 0.884 | 0.877 | 0.638 | 0.764 | 0.370 | 0.530 |
| v001 | 2026-11-07 22:00 | manual | 0.884 | 0.877 | 0.638 | 0.764 | 0.370 | – |
