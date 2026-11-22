# Deploy lên Oracle Cloud Always Free

Toàn bộ stack (Caddy, frontend, backend, ai-service, Postgres, MinIO, Redis) chạy trên **1 VM ARM**,
ảnh nằm trong MinIO trên block volume của Oracle, backup kéo về máy ở nhà.
Mục 10 = chuyển ảnh sang S3 bên ngoài (R2 / B2 / S3) khi cần, chỉ đổi `.env`.

```
Internet ─▶ Caddy :80/:443 ─┬─ /api/* ─▶ backend ─▶ Postgres · MinIO · Redis · ai-service
                            └─ /*     ─▶ frontend (Nginx)
            (1 VM A1: 4 OCPU · 24 GB RAM · boot 50 GB + block volume 150 GB ở /data)
```

## 0. Cần có
- Email chưa từng đăng ký Oracle, số điện thoại, thẻ Visa/Mastercard **thật** (thẻ ảo / prepaid hay bị từ chối).
  Oracle tạm giữ ~1 USD để xác minh rồi hoàn lại.
- 1 domain. Cloudflare **không cấp domain free**:
  - mua ở Cloudflare Registrar (giá gốc, `.com` ~10 USD/năm) — tiện nhất vì DNS ở sẵn Cloudflare; hoặc
  - mua ở nơi khác (Namecheap, Porkbun, nhà đăng ký `.vn`…) rồi chuyển DNS về Cloudflare (bước 6); hoặc
  - `.id.vn` free cho người 18–23 tuổi (chương trình của VNNIC — kiểm tra điều kiện hiện tại).
- SSH key trên máy Mac: `ssh-keygen -t ed25519 -f ~/.ssh/oracle_tng`.

## 1. Đăng ký Oracle Cloud Free Tier
1. Vào **oracle.com/cloud/free** → **Start for free**.
2. Điền Country = Vietnam, tên, email → xác minh email.
3. Đặt mật khẩu, **Cloud Account Name** (tên tenancy, dùng để đăng nhập về sau — ghi lại).
4. **Home Region**: Singapore (`ap-singapore-1`) hoặc Tokyo (`ap-tokyo-1`). **Không đổi được**, và máy A1 free
   chỉ tạo ở home region. Region đông người → hay hết máy A1; Singapore/Tokyo đều hay bị, cứ thử lại.
5. Địa chỉ + số điện thoại (nhận SMS) → thêm thẻ → đồng ý điều khoản → **Start my free trial**.
6. Đợi email "Your account is ready" (vài phút, có khi vài giờ). Đăng nhập tại cloud.oracle.com bằng Cloud Account Name.
   Bị từ chối → thường do thẻ / thông tin không khớp; thử thẻ khác, không dùng VPN.
7. Tài khoản mới có 300 USD trial 30 ngày; hết trial vẫn giữ tài nguyên **Always Free**. Khuyên:
   Billing & Cost Management → **Upgrade and Manage Payment** → **Pay As You Go** — vẫn 0đ nếu ở trong hạn mức free,
   nhưng không bị thu hồi VM khi nhàn rỗi và dễ tạo máy A1 hơn.
8. Billing → **Budgets** → tạo budget 1 USD, alert 100% → email nếu lỡ dùng thứ tính phí.
   Mỗi khi tạo tài nguyên, chỉ chọn thứ có nhãn **Always Free-eligible**.

## 2. Mạng (VCN)
1. Networking → Virtual Cloud Networks → **Start VCN Wizard** → "Create VCN with Internet Connectivity".
2. Vào public subnet → Security List → **Add Ingress Rules**, source `0.0.0.0/0`:
   - TCP `80`, TCP `443`
   - (chỉ khi bật TURN) UDP+TCP `3478`, UDP `49160-49200`

## 3. Tạo VM
Compute → Instances → Create:
- Image: **Canonical Ubuntu 24.04** (bản aarch64 tự chọn theo shape).
- Shape: **VM.Standard.A1.Flex**, 4 OCPU, 24 GB RAM.
- Networking: public subnet ở bước 2, **Assign public IPv4**.
- SSH: dán `~/.ssh/oracle_tng.pub`.
- Boot volume: **50 GB**.

Lỗi "Out of capacity" → thử Availability Domain khác, thử lại giờ khác, hoặc sau khi lên PAYG.

Sau đó: Networking → IP management → đổi public IP thành **Reserved** (IP không đổi khi tạo lại VM).

```bash
ssh -i ~/.ssh/oracle_tng ubuntu@<IP>
```

## 4. Block volume cho dữ liệu (150 GB)
1. Storage → Block Volumes → Create, **150 GB** (50 + 150 = 200 GB = hết hạn mức free), cùng AD với VM.
2. Instance → Attached block volumes → Attach → **Paravirtualized**.
3. Trên VM:
```bash
lsblk                                  # ổ mới 150G, thường /dev/sdb
sudo mkfs.ext4 -L tngdata /dev/sdb     # CHỈ lần đầu — xoá sạch ổ
sudo mkdir -p /data
echo 'LABEL=tngdata /data ext4 defaults,_netdev,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a && df -h /data
```

## 5. Firewall trong Ubuntu + Docker
Image Ubuntu của Oracle **chặn sẵn bằng iptables** (mở Security List thôi là chưa đủ):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Docker, để **toàn bộ dữ liệu Docker (MinIO, Postgres, image) nằm trên /data**:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
sudo systemctl stop docker docker.socket
echo '{ "data-root": "/data/docker" }' | sudo tee /etc/docker/daemon.json
sudo systemctl start docker
exit   # đăng nhập lại để nhận nhóm docker
docker info | grep "Docker Root Dir"   # → /data/docker
```

## 6. Domain qua Cloudflare (chỉ DNS — đám mây xám)
Traffic vẫn đi thẳng vào VM; Cloudflare chỉ quản lý DNS (không giới hạn 100 MB upload, WebRTC/TURN chạy bình thường).
1. Đăng ký tại dash.cloudflare.com (free, chỉ cần email).
2. **Domain mua ở Cloudflare Registrar** → đã ở sẵn, bỏ qua bước 3.
3. **Domain mua nơi khác** → Cloudflare: **Add a domain** → nhập domain → plan **Free** → Cloudflare cho 2 nameserver
   (vd `xxx.ns.cloudflare.com`). Vào trang nhà đăng ký → đổi Nameservers thành 2 cái đó → đợi email "domain is active"
   (vài phút – 24 giờ).
4. Domain → **DNS → Records → Add record**:
   - Type `A`, Name `gallery` (→ `gallery.<domain>`; hoặc `@` = domain gốc), IPv4 = IP public (Reserved) của VM.
   - **Proxy status: tắt → "DNS only" (đám mây xám)**. Đây là điểm quan trọng nhất.
   - TTL Auto → Save.
5. Kiểm tra từ Mac: `dig +short gallery.<domain>` → phải ra đúng IP Oracle (không phải IP Cloudflare 104.x / 172.x).
6. Không cần đụng mục SSL/TLS của Cloudflare: ở chế độ DNS only, chứng chỉ HTTPS do **Caddy trên VM** tự lấy
   (Let's Encrypt) khi `SITE_ADDRESS` = domain này và port 80/443 đã mở (bước 2 + 5).

Về sau muốn bật proxy (đám mây cam): SSL/TLS mode **Full (strict)**, chấp nhận giới hạn 100 MB/request, TURN dùng subdomain DNS-only riêng.

## 7. Code + `.env`
```bash
git clone https://github.com/thangismyname/the-next-gallery.git ~/tng   # repo private → dùng deploy key / gh auth
cd ~/tng && git switch main
nano .env && chmod 600 .env
```

`.env` production tối thiểu (container không đọc `.env` trực tiếp — compose chuyển các biến này vào):
```ini
SITE_ADDRESS=gallery.example.com                 # Caddy tự lấy HTTPS cho domain này
PUBLIC_API_BASE_URL=https://gallery.example.com/api   # build arg của frontend — đặt TRƯỚC khi build
PUBLIC_API_BASE_URL_ROOT=https://gallery.example.com
CORS_ORIGINS=https://gallery.example.com

DB_USER=tng
DB_PASSWORD=<openssl rand -hex 24>
DB_NAME=the_next_gallery

MINIO_ACCESS_KEY=tngadmin
MINIO_SECRET_KEY=<openssl rand -hex 24>
MINIO_BUCKET=the-next-gallery

BETTER_AUTH_SECRET=<openssl rand -base64 32>     # ≥ 32 ký tự, không thì backend không chạy
MEDIA_URL_SECRET=<openssl rand -base64 32>

AI_EMBED_PROVIDER=open_clip
AI_OBJECT_PROVIDER=yolo
AI_SIMILARITY_PROVIDER=stub    # DINOv3 bị gated, không có trong image → "Ảnh tương tự" dùng CLIP thay thế
```
Đăng nhập Google/GitHub: thêm `https://gallery.example.com/api/auth/callback/google` (…/github) vào OAuth app rồi điền
`GOOGLE_CLIENT_ID/SECRET`. Để trống = tắt. SMTP tương tự (trống = tắt quên mật khẩu).

## 8. Chạy
```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d   # lần đầu lâu (ai-service + torch)
docker compose -f docker-compose.prod.yml ps                              # tất cả healthy
curl https://gallery.example.com/api/health
docker compose -f docker-compose.prod.yml logs -f backend                 # xem lỗi
```
Đăng ký tài khoản trên web rồi cấp quyền admin:
```bash
docker exec -it gallery_postgres psql -U tng -d the_next_gallery \
  -c "UPDATE \"user\" SET role = 'admin' WHERE email = 'you@example.com';"
```
Cập nhật bản mới:
```bash
cd ~/tng && git fetch origin && git merge --ff-only origin/main
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

## 9. Backup (bắt buộc — máy free không có cam kết)
Bản backup phải nằm **ngoài Oracle**. Không chép MinIO sang chỗ khác trên VM (sẽ hết 150 GB).

Trên VM, dump DB mỗi đêm (nhỏ, giữ 7 bản):
```bash
mkdir -p /data/backup
crontab -e
# 0 3 * * * docker exec gallery_postgres pg_dump -U tng -Fc the_next_gallery > /data/backup/db-$(date +\%a).dump
```
Trên máy ở nhà (SSD rời), kéo về bằng rsync (chỉ tải phần thay đổi):
```bash
VOL=$(ssh -i ~/.ssh/oracle_tng ubuntu@<IP> docker volume inspect -f '{{.Mountpoint}}' tng_minio_data)
rsync -az -e "ssh -i ~/.ssh/oracle_tng" ubuntu@<IP>:/data/backup/ /Volumes/<SSD>/tng/db/
rsync -az --delete --rsync-path="sudo rsync" -e "ssh -i ~/.ssh/oracle_tng" \
  ubuntu@<IP>:"$VOL"/ /Volumes/<SSD>/tng/minio/
```
(Tên volume = `<tên thư mục>_minio_data`, clone vào `~/tng` → `tng_minio_data`; kiểm tra bằng `docker volume ls`.)

Khôi phục: `pg_restore -c -d …` cho DB; dừng `minio`, chép thư mục `minio/` vào lại volume, chạy lại.
Thêm 1 lớp nữa (cùng Oracle, chống lỗi thao tác chứ không chống mất tài khoản): Block Volume → **Backup policy** (Always Free có 5 bản).

## 10. Sau này: chuyển ảnh sang S3 bên ngoài
Backend dùng API S3 chuẩn, nên chỉ cần đổi `.env`. Ví dụ Cloudflare R2:
1. Tạo bucket `the-next-gallery` + API token (Object Read & Write) trên R2.
2. Chép dữ liệu cũ sang (chạy trên VM, trong mạng của compose):
```bash
docker run --rm --network tng_internal --entrypoint sh minio/mc -c '
  mc alias set old http://minio:9000 <MINIO_ACCESS_KEY> <MINIO_SECRET_KEY> &&
  mc alias set new https://<accountid>.r2.cloudflarestorage.com <R2_KEY> <R2_SECRET> &&
  mc mirror old/the-next-gallery new/the-next-gallery'
```
3. Sửa `.env` rồi `up -d` lại:
```ini
MINIO_ENDPOINT=<accountid>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_SECURE=true
MINIO_REGION=auto
MINIO_ACCESS_KEY=<R2_KEY>
MINIO_SECRET_KEY=<R2_SECRET>
```
Bỏ 4 dòng đó = quay về MinIO trên VM. Service `minio` trong compose vẫn chạy (backend `depends_on` nó) — vô hại.
B2 (S3 API) không nhận lifecycle rule → backend chỉ log cảnh báo, job dọn relay của Quick send vẫn tự xoá đúng hạn.
