# Hướng dẫn Thiết lập và Triển khai Sprintos NestJS API (Docker)

Tài liệu này hướng dẫn bạn cách thiết lập môi trường phát triển (Development) cục bộ bằng Docker, kết nối Database bằng DBeaver và quy trình triển khai (Deployment) lên máy chủ Production.

---

## I. THIẾT LẬP MÔI TRƯỜNG PHÁT TRIỂN (DEVELOPMENT LOCAL)

### 1. Chuẩn bị file môi trường `.env`
Tạo file `.env` tại thư mục root của `Sprintos-Nestjs-API` (dựa trên mẫu của `.env.example`).
Đặc biệt lưu ý các cấu hình cơ sở dữ liệu để tránh xung đột cổng với Postgres chạy trực tiếp trên Windows:

```env
DB_USER=wangcoder2k5
DB_PASSWORD=25092005quang
DB_NAME=sprintos-db
DB_PORT=5433 # Sử dụng cổng 5433 để tránh xung đột nếu máy bạn đã cài sẵn Postgres ở cổng 5432

# URL kết nối cho NestJS app (chạy trong mạng nội bộ docker)
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}?schema=public"
```

### 2. Khởi chạy dự án bằng Docker
Mở Terminal tại thư mục `Sprintos-Nestjs-API` và thực hiện:

```bash
# Khởi động cơ sở dữ liệu Postgres và NestJS Backend ở chế độ chạy ngầm
npm run docker:dev-up
```
*Lưu ý: Lần đầu tiên chạy lệnh này sẽ mất chút thời gian để build image và tải thư viện.*

### 3. Khởi tạo dữ liệu và Phân quyền (Database Setup)
Sau khi container đã hiển thị trạng thái `Started` thành công, chạy lệnh sau ở máy host để khởi tạo dữ liệu ban đầu:

```bash
# Chạy cả hai lệnh Seed dữ liệu Admin và quét tạo Permissions cho các Route
npm run docker:setup
```
*(Nếu muốn chạy riêng lẻ, bạn có thể dùng `npm run docker:seed` hoặc `npm run docker:permissions`)*

### 4. Tắt môi trường Dev khi không sử dụng
```bash
npm run docker:dev-down
```

---

## II. KẾT NỐI DATABASE BẰNG DBEAVER

Để xem và quản lý dữ liệu trong container PostgreSQL từ máy host bằng DBeaver:

1. Mở DBeaver và tạo **New Connection** -> chọn **PostgreSQL**.
2. Điền chính xác các thông số cấu hình lấy từ file `.env` của bạn:
   - **Host**: `localhost` (hoặc `127.0.0.1`)
   - **Port**: **`5433`** *(Cổng ngoài host đã đổi từ 5432 sang 5433)*
   - **Database**: `sprintos-db`
   - **Username**: `wangcoder2k5`
   - **Password**: `25092005quang`
3. Chuyển qua tab **SSL**: Đảm bảo **Disable SSL** (không tích chọn).
4. Nhấn **Test Connection** để kiểm tra và nhấn **Finish**.

---

## III. CÁC SCRIPT HỮU ÍCH TRONG `package.json`

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `npm run docker:dev-up` | Khởi chạy Docker Compose (Postgres + NestJS) môi trường Dev |
| `npm run docker:dev-down` | Dừng và xóa các container dev |
| `npm run docker:seed` | Khởi tạo 6 Role và tài khoản Admin mặc định |
| `npm run docker:permissions` | Quét router NestJS và cập nhật phân quyền tự động |
| `npm run docker:setup` | Chạy gộp cả 2 lệnh `seed` và `permissions` |
| `npm run docker:migrate` | Chạy cập nhật cấu trúc database dựa trên migration |

---

## IV. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Lỗi xác thực tài khoản Postgres (`Authentication failed`)
* **Hiện tượng**: Log báo lỗi kết nối `Authentication failed for user...` sau khi bạn vừa đổi tài khoản/mật khẩu trong file `.env`.
* **Lý do**: Docker vẫn tái sử dụng Volume cũ vốn được tạo bằng tài khoản cũ.
* **Cách sửa**: Chạy lệnh xóa hoàn toàn volume cũ để khởi tạo lại:
  ```bash
  docker compose down -v
  npm run docker:dev-up
  ```

### 2. Lỗi tràn bộ nhớ RAM (`Heap out of memory`) khi chạy permissions
* **Lý do**: Lệnh `ts-node` mặc định chạy cơ chế Type-checking biên dịch toàn bộ dự án TypeScript rất nặng.
* **Cách sửa**: Lệnh đã được cập nhật thêm flag `--transpile-only` để chỉ chuyển dịch code và chạy luôn, giảm lượng tiêu thụ RAM từ 2GB xuống dưới 150MB.

### 3. Lỗi xung đột cổng `5432` trên máy Windows
* **Lý do**: Máy bạn đã cài sẵn PostgreSQL cục bộ đang chạy.
* **Cách sửa**: Đảm bảo cấu hình `DB_PORT=5433` trong file `.env`.

---

## V. QUY TRÌNH DEPLOY LÊN PRODUCTION (VPS)

Khi triển khai lên Production, chúng ta sử dụng thư mục độc lập `/Sprintos-Deploy`. Thư mục này chỉ chứa các cấu hình deploy cần thiết và Nginx, không chứa mã nguồn thô của dự án.

### Bước 1: Build và Push Docker Image từ Local
```bash
# 1. Đăng nhập Docker Hub
docker login

# 2. Build image production với dung lượng tối ưu nhất
docker build --target production -t <username_cua_ban>/sprintos-api:latest .

# 3. Đẩy image lên Docker Hub
docker push <username_cua_ban>/sprintos-api:latest
```

### Bước 2: Chạy Migrations database cho Production
Chạy trực tiếp từ máy local tới database Production (ví dụ: Neon DB) để cập nhật bảng:
```bash
# Đảm bảo DATABASE_URL trong .env đang trỏ tới DB Production thực tế
npx prisma migrate deploy
```

### Bước 3: Deploy trên VPS
1. Sao chép thư mục `/Sprintos-Deploy` lên VPS (vào thư mục `/app/sprintos-deploy`).
2. SSH vào VPS và cập nhật file `.env.production` với các cấu hình bảo mật thực tế.
3. Chạy các lệnh khởi động trên VPS:
   ```bash
   cd /app/sprintos-deploy
   docker compose pull
   docker compose up -d
   ```
