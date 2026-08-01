# 🚀 Sprintos - Hướng dẫn Dữ liệu Mẫu & Tài khoản Test (Seed Data)

Tài liệu này tổng hợp toàn bộ thông tin dữ liệu mẫu được khởi tạo tự động trong hệ thống **Sprintos**, bao gồm các tài khoản thử nghiệm, các Workspace (Dự án), Sprints, Tasks, Phân quyền (Permissions) và Thông báo.

---

## 🔑 1. Thông tin Đăng nhập Mặc định

> **LƯU Ý QUAN TRỌNG:**
> Mật khẩu mặc định cho **TẤT CẢ** các tài khoản mẫu dưới đây là: **`sprintos@!`**

---

## 👑 2. Tài khoản Quản trị Hệ thống (System Admin)

Tài khoản có quyền `ADMIN` hệ thống, có thể quản lý toàn bộ User, Role, Permission và cài đặt hệ thống.

| Email | Mật khẩu | Tên hiển thị | System Role | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `admin@sprintos.com` | **`sprintos@!`** | System Admin | `ADMIN` | Quản trị viên tối cao của hệ thống Sprintos |

---

## 👥 3. Danh sách 14 Tài khoản Kiểm thử (Standard Users)

Các tài khoản dưới đây mang vai trò hệ thống `USER` và được phân bổ sẵn làm **Owner**, **Co-Owner**, **Member**, hoặc **Viewer** trong các dự án mẫu:

| STT | Email | Mật khẩu | Tên hiển thị | System Role | Chức danh / Dự án làm Chủ sở hữu (Owner) |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **1** | `sarah.pm@sprintos.com` | **`sprintos@!`** | Sarah Chen | `USER` | Agile Product Manager *(Owner: Sprintos Mobile App)* |
| **2** | `alex.dev@sprintos.com` | **`sprintos@!`** | Alex Rivera | `USER` | Senior Fullstack Lead *(Owner: E-Commerce Redesign)* |
| **3** | `emily.ux@sprintos.com` | **`sprintos@!`** | Emily Watson | `USER` | Lead Product Designer *(Owner: Sprintos Design System)* |
| **4** | `jessica.mkt@sprintos.com` | **`sprintos@!`** | Jessica Taylor | `USER` | Growth Marketing Manager *(Owner: Q3 Growth Marketing)* |
| **5** | `robert.devops@sprintos.com` | **`sprintos@!`** | Robert Johnson | `USER` | DevOps Lead *(Owner: Cloud Infrastructure Migration)* |
| **6** | `michael.tech@sprintos.com` | **`sprintos@!`** | Michael Vance | `USER` | Backend Architect *(Owner: Internal ERP Automation)* |
| **7** | `david.qa@sprintos.com` | **`sprintos@!`** | David Miller | `USER` | QA Lead & Automation Specialist |
| **8** | `lisa.frontend@sprintos.com` | **`sprintos@!`** | Lisa Anderson | `USER` | React / Next.js Specialist |
| **9** | `james.backend@sprintos.com` | **`sprintos@!`** | James Wilson | `USER` | NestJS & PostgreSQL Developer |
| **10** | `amanda.content@sprintos.com` | **`sprintos@!`** | Amanda Martinez | `USER` | Content Strategy & Technical Writer |
| **11** | `kevin.fullstack@sprintos.com` | **`sprintos@!`** | Kevin Thomas | `USER` | Software Engineer |
| **12** | `rachel.designer@sprintos.com` | **`sprintos@!`** | Rachel White | `USER` | UI & Graphic Designer |
| **13** | `daniel.sec@sprintos.com` | **`sprintos@!`** | Daniel Lee | `USER` | Cybersecurity Analyst |
| **14** | `olivia.intern@sprintos.com` | **`sprintos@!`** | Olivia Harris | `USER` | Junior Developer |

---

## 📁 4. Danh sách Dự án (Workspaces) & Thành viên Mẫu

Hệ thống khởi tạo sẵn **6 Dự án mẫu** với đầy đủ các cột Board (To Do, In Progress, In Review, Done), Sprints, Tasks, Comments và File đính kèm:

1. **Sprintos Mobile App**
   - **Owner**: Sarah Chen (`sarah.pm@sprintos.com`)
   - **Co-Owner**: Alex Rivera
   - **Members**: Lisa Anderson, James Wilson, David Miller
   - **Viewer**: Olivia Harris

2. **E-Commerce Redesign**
   - **Owner**: Alex Rivera (`alex.dev@sprintos.com`)
   - **Co-Owner**: Emily Watson
   - **Members**: Kevin Thomas, Lisa Anderson, David Miller
   - **Viewer**: Amanda Martinez

3. **Sprintos Design System**
   - **Owner**: Emily Watson (`emily.ux@sprintos.com`)
   - **Co-Owner**: Rachel White
   - **Members**: Lisa Anderson
   - **Viewer**: Olivia Harris

4. **Q3 Growth Marketing**
   - **Owner**: Jessica Taylor (`jessica.mkt@sprintos.com`)
   - **Co-Owner**: Amanda Martinez
   - **Members**: Kevin Thomas
   - **Viewer**: Rachel White

5. **Cloud Infrastructure Migration**
   - **Owner**: Robert Johnson (`robert.devops@sprintos.com`)
   - **Co-Owner**: Daniel Lee
   - **Members**: James Wilson, Michael Vance

6. **Internal ERP Automation**
   - **Owner**: Michael Vance (`michael.tech@sprintos.com`)
   - **Co-Owner**: James Wilson
   - **Members**: Alex Rivera

---

## 🛠️ 5. Hướng dẫn Chạy Script Seed Data

Bạn có thể chạy lại script seed data bất kỳ lúc nào để khôi phục dữ liệu mẫu ban đầu:

### Chạy trực tiếp ở môi trường Local:
```bash
npm run seed:data
```

### Chạy trong Docker Container:
```bash
npm run docker:seed
```

> **Lưu ý:** Script sẽ tự động quét toàn bộ các API Endpoints trong NestJS, khởi tạo/cập nhật danh sách **Permissions**, gán quyền tự động cho 6 Roles (`ADMIN`, `USER`, `OWNER`, `CO_OWNER`, `MEMBER`, `VIEWER`), và tạo lại toàn bộ dữ liệu mẫu với định dạng ID CUID2 chuẩn.
