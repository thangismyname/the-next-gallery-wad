# Quy trình Git — The Next Gallery

Tài liệu cho chủ repo (thang-ismyname) và cho mọi agent / developer hỗ trợ.
**Agent: đọc hết file này trước khi đề xuất hay chạy bất kỳ lệnh git nào.**

## 1. Hai repo

| Remote | Repo | Vai trò |
|---|---|---|
| `origin` | `github.com/thangismyname/the-next-gallery` | **Repo CHÍNH** — code của chủ repo, nguồn sự thật |
| `collab` | `github.com/thangismyname/the-next-gallery-wad` | **Repo nhóm** — bản sao từ `origin`, developer khác làm việc ở đây |

- Code đi được **2 chiều** (`origin` ⇄ `collab`), nhưng **mọi lần vào `main` / `develop` đều qua Pull Request** do chủ repo duyệt.
- `collab` **không phải fork** của `origin` trên GitHub → không mở PR trực tiếp giữa 2 repo; đồng bộ bằng nhánh `sync/*` đẩy từ máy (mục 5).

## 2. Nhánh

```
main      ← bản ổn định (demo / nộp luận văn)
 └─ develop   ← gom tính năng, nhánh MẶC ĐỊNH của cả 2 repo
     ├─ thang-ismyname/<tính-năng>   ← nhánh làm việc của chủ repo
     ├─ <tên-dev-khác>/<tính-năng>   ← developer khác (trên collab)
     └─ sync/from-origin-<ngày> | sync/from-collab-<ngày>   ← nhánh đồng bộ 2 repo
```

| Loại nhánh | Tạo từ | PR vào | Cách merge |
|---|---|---|---|
| `thang-ismyname/<tính-năng>` | `develop` | `develop` | **Squash and merge** |
| `develop` → `main` (phát hành) | — | `main` | **Create a merge commit** |
| `sync/from-origin-<ngày>` (trên collab) | `origin/main` | `collab/main` | **Create a merge commit** |
| `sync/from-collab-<ngày>` (trên origin) | `collab/develop` | `origin/develop` | **Create a merge commit** |

- Tên nhánh: chữ thường, gạch ngang, ví dụ `thang-ismyname/download-zip`. Mỗi tính năng 1 nhánh, sống ngắn, xoá sau khi merge.
- **Không bao giờ squash** PR `develop → main` hay PR `sync/*` — squash làm Git mất dấu phần đã merge, lần sau sẽ conflict lặp lại.

## 3. Nguyên tắc (không có ngoại lệ)

1. **Không đặt config git** (`remote.pushDefault`, upstream, alias…). Mọi lệnh **ghi rõ remote + nhánh**: `git push origin <nhánh>`, `git merge --ff-only origin/develop`.
2. **Không gõ `git pull` / `git push` trống.**
3. **Không push thẳng vào `main` / `develop`** — chỉ qua PR (ruleset cũng chặn).
4. **Không force push** nhánh dùng chung. Nhánh cá nhân đã rebase: `git push --force-with-lease origin <nhánh>`.
5. **Không commit `.env`**, weights model (`*.pt`, `*.safetensors`, `*.npz`), dataset, font độc quyền (Product Sans). Font DFVN Basteleur (SIL OFL) được commit.
6. **Trước khi tạo PR luôn kiểm tra dòng `base: … ← compare: …`** (PR #1 từng merge nhầm vào `main` vì base mặc định).
7. Agent **không tự push / tạo PR / merge** — chỉ chạy lệnh cục bộ khi được yêu cầu và đưa lệnh push để chủ repo tự chạy.

## 4. Làm một tính năng (trên `origin`)

```bash
# 1. Lấy develop mới nhất
git fetch origin
git switch develop
git merge --ff-only origin/develop

# 2. Nhánh làm việc
git switch -c thang-ismyname/<ten-tinh-nang>

# 3. Code xong → commit theo nhóm (mỗi nhóm: add → xem lại → commit)
git add <đường-dẫn>
git diff --cached --stat
git commit -m "feat(<khu-vực>): <mô tả>"
#   gỡ nhầm: git restore --staged <file>    |   chọn từng đoạn: git add -p <file>

# 4. Kiểm tra trước khi push
git status --short | wc -l                    # 0
git log --oneline origin/develop..HEAD        # các commit sẽ vào PR

# 5. Đẩy nhánh
git push origin thang-ismyname/<ten-tinh-nang>
git ls-remote origin thang-ismyname/<ten-tinh-nang>   # hash = commit cuối
```

6. GitHub `the-next-gallery` → **Compare & pull request** → **base `develop`** ← nhánh → Create → xem *Files changed* → **Squash and merge** → **Delete branch**.

```bash
# 7. Sau khi PR ĐÃ merge (đừng chạy trước khi merge)
git fetch origin
git switch develop
git merge --ff-only origin/develop
git log --oneline -3                          # thấy commit squash ở đầu
git branch -D thang-ismyname/<ten-tinh-nang>  # -D vì đã squash
```

**Cập nhật nhánh theo develop khi đang làm dở:**
```bash
git fetch origin
git merge origin/develop          # hoặc: git rebase origin/develop (rồi push --force-with-lease)
```

**Quy ước message:** `feat(...)` tính năng · `fix(...)` sửa lỗi · `refactor(...)` · `docs:` · `chore:` (cấu hình, dependency).

## 5. Phát hành và đồng bộ

### 5.1 `develop` → `main` (trên `origin`)
GitHub `the-next-gallery` → New pull request → **base `main`** ← **compare `develop`** → **Create a merge commit**.

```bash
git fetch origin
git switch main
git merge --ff-only origin/main
git switch develop
```

### 5.2 `origin` → `collab` (gửi bản mới cho nhóm)
```bash
git fetch origin
git fetch collab
git push collab origin/main:refs/heads/sync/from-origin-<YYYY-MM-DD>
git ls-remote collab sync/from-origin-<YYYY-MM-DD>
```
GitHub `the-next-gallery-wad` → PR **base `main`** ← `sync/from-origin-<ngày>` → **Create a merge commit** → Delete branch.
Sau đó PR **base `develop`** ← **compare `main`** (merge commit) để `collab/develop` cũng có bản mới.

### 5.3 `collab` → `origin` (lấy code developer khác về repo chính)
```bash
git fetch collab
git switch --no-track -c sync/from-collab-<YYYY-MM-DD> collab/develop
git fetch origin
git merge origin/develop          # có conflict thì sửa NGAY trên nhánh này, rồi git add + git commit
git push origin sync/from-collab-<YYYY-MM-DD>
```
GitHub `the-next-gallery` → PR **base `develop`** ← `sync/from-collab-<ngày>` → review kỹ → **Create a merge commit**.

```bash
git switch develop
git branch -D sync/from-collab-<YYYY-MM-DD>
git push origin --delete sync/from-collab-<YYYY-MM-DD>   # nếu GitHub chưa tự xoá
```

- Đồng bộ **thường xuyên** (sau mỗi đợt merge) để conflict nhỏ.
- Merge commit của PR sync chỉ có ở repo nhận → commit đầu 2 repo khác hash nhưng **code giống nhau** — bình thường. Kiểm tra: `git diff --stat origin/main collab/main` (trống = giống).

### 5.4 Đánh dấu phiên bản (tuỳ chọn)
```bash
git switch main
git merge --ff-only origin/main
git tag -a v1.0 -m "Thesis demo"
git push origin v1.0
git push collab v1.0
```

## 6. Quyền trên GitHub (đã cấu hình — ghi lại để biết)

Cả 2 repo: **Settings → Rules → Rulesets** — 1 ruleset:
- **Target branches:** `main`, `develop`
- **Bypass list:** *Repository admin* — *Always allow* (chủ repo tự merge PR của mình; PR người khác vẫn cần chủ repo approve)
- **Branch rules:** Require a pull request (1 approval) · Block force pushes · Restrict deletions
- **Tắt:** Require linear history (sẽ cấm merge commit), Restrict creations
- **Allowed merge methods:** Merge + Squash
- **Settings → General → Default branch:** `develop`

Quyền người khác: `origin` chỉ **Read** (nếu mời); `collab` **Write** (push nhánh riêng, merge vẫn cần duyệt).

**Merge PR của chính mình khi bị "Review required":** tick **Merge without waiting for requirements to be met (bypass rules)** → chọn kiểu merge → Confirm. (GitHub không cho tác giả tự approve.)

Tuỳ chọn: thêm `.github/CODEOWNERS` với dòng `* @thangismyname` + bật *Require review from Code Owners* để mọi thay đổi đều cần chủ repo duyệt.

## 7. Kiểm tra trước khi push / tạo PR

```bash
# Không có .env thật, file lớn, weights
git diff --name-only origin/develop..HEAD | grep -E "(^|/)\.env$"                       # phải rỗng
git diff --name-only --diff-filter=A origin/develop..HEAD | grep -iE "\.(pt|pth|onnx|safetensors|npz)$"   # phải rỗng

# Frontend
cd frontend && npm run lint && npm run build
# AI service
cd ai-service && uv run pytest
```
Đổi `package.json` → commit cả `package-lock.json` cùng lúc. Người review chạy `npm ci` (frontend) / `npm install` (backend).

## 8. Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `git log origin/develop..HEAD` rỗng | Chưa commit (có thể đã `git add` hết) | `git diff --cached --stat` xem staged; commit, hoặc `git restore --staged .` để chia lại |
| PR merge vào `main` thay vì `develop` | Base mặc định là `main` | Code không mất. `develop` chưa có gì riêng: `git switch develop && git merge --ff-only origin/main && git push origin develop`. Đặt Default branch = `develop` |
| Lỡ `git branch -D` nhánh chưa merge | — | Nhánh đã push: `git switch --no-track -c <nhánh> origin/<nhánh>`. Chưa push: `git reflog` tìm hash → `git switch -c <nhánh> <hash>` |
| `Merging is blocked — 1 approving review required` | Ruleset bắt buộc approve, tác giả không tự approve được | Tick ô bypass (mục 6). Không thấy ô → thêm *Repository admin* vào Bypass list |
| `git merge --ff-only` báo `Not possible to fast-forward` | Nhánh local có commit riêng / lệch remote | Đừng ép. `git log --oneline --graph HEAD origin/<nhánh>` xem lệch gì, hỏi lại trước khi xử lý |
| `! [rejected] … (fetch first)` khi push | Remote có commit mới hơn | `git fetch origin` → `git merge origin/<nhánh>` → push lại |
| Push tạo nhánh bị từ chối (`GH013` / rule violation) | Ruleset *Restrict creations* hoặc target là All branches | Tắt *Restrict creations* / để Target = `main`, `develop` |
| Conflict khi merge | Hai bên sửa cùng chỗ | Sửa file (bỏ `<<<<<<<` `=======` `>>>>>>>`), `git add <file>`, `git commit`. Bỏ cuộc: `git merge --abort` |
| `git status` hiện thư mục lạ `??` sau khi đổi nhánh | `.gitignore` của nhánh cũ chưa có luật mới | Về nhánh mới nhất; vẫn còn thì kiểm tra trước khi commit (thường là output bench / weights) |

## 9. Bảng lệnh nhanh

| Muốn | Lệnh |
|---|---|
| Đang ở nhánh nào | `git branch --show-current` |
| Nhánh local + nhánh theo dõi | `git branch -vv` |
| Nhánh trên remote | `git ls-remote --heads origin` · `git ls-remote --heads collab` |
| Lấy mới (không đổi code local) | `git fetch origin` · `git fetch collab` |
| Commit sẽ vào PR | `git log --oneline origin/develop..HEAD` |
| Xem đồ thị | `git log --oneline --graph -10 --all` |
| Code 2 repo có giống nhau | `git diff --stat origin/main collab/main` |
| Huỷ thay đổi 1 file chưa commit | `git restore <file>` (mất thay đổi — cẩn thận) |
| Cất tạm thay đổi | `git stash push -m "<ghi chú>"` · lấy lại `git stash pop` |

## 10. Lịch sử

- 2026-10-30 — Commit đầu `5683d35`. PR #1 (`thang-ismyname/gallery-features`, 10 commit) squash vào `origin/main` → `ab0cfc4` (nhầm base, đã fast-forward `develop` lên cùng commit). Sync sang `collab` qua PR `sync/from-origin-2026-10-30` → `collab/main` = `collab/develop` = `9b9a503`. Đã đặt Default branch `develop` + ruleset cho cả 2 repo.
