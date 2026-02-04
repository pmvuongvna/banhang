# QLBH - Quản Lý Bán Hàng

Ứng dụng quản lý bán hàng gọn nhẹ, sử dụng Google Sheets làm database.

## 🚀 Hướng Dẫn Cài Đặt

### Bước 1: Tạo Google Cloud Project

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo **Project mới** (hoặc chọn project có sẵn)
3. Đặt tên project (ví dụ: "QLBH App")

### Bước 2: Bật APIs

1. Trong menu bên trái, chọn **APIs & Services** > **Library**
2. Tìm và bật các API sau:
   - **Google Sheets API**
   - **Google Drive API**

### Bước 3: Cấu hình OAuth Consent Screen

1. Vào **APIs & Services** > **OAuth consent screen**
2. Chọn **External** và nhấn **Create**
3. Điền thông tin:
   - App name: `QLBH`
   - User support email: email của bạn
   - Developer contact: email của bạn
4. Nhấn **Save and Continue**
5. Ở bước **Scopes**, nhấn **Add or Remove Scopes** và thêm:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
6. **Save and Continue** qua các bước còn lại

### Bước 4: Tạo OAuth Credentials

1. Vào **APIs & Services** > **Credentials**
2. Nhấn **+ Create Credentials** > **OAuth client ID**
3. Chọn Application type: **Web application**
4. Đặt tên: `QLBH Web Client`
5. Thêm **Authorized JavaScript origins**:
   - `http://localhost` (để test local)
   - `http://127.0.0.1:5500` (nếu dùng Live Server)
   - Domain của bạn (nếu deploy)
6. Nhấn **Create**
7. **Copy Client ID** (dạng: `xxx.apps.googleusercontent.com`)

### Bước 5: Cấu hình ứng dụng

1. Mở file `config.js`
2. Thay thế `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` bằng Client ID vừa copy
3. (Tùy chọn) Thêm API Key nếu có

```javascript
const CONFIG = {
    CLIENT_ID: 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com',
    // ...
};
```

### Bước 6: Chạy ứng dụng

#### Cách 1: Live Server (VS Code)
1. Cài extension **Live Server** trong VS Code
2. Click chuột phải vào `index.html` > **Open with Live Server**

#### Cách 2: Python HTTP Server
```bash
cd qlbh-sheets
python -m http.server 8000
# Mở http://localhost:8000
```

#### Cách 3: Node.js HTTP Server
```bash
npx serve .
```

## 📱 Tính Năng

- ✅ **Quản lý sản phẩm**: Thêm/Sửa/Xóa, tự động tính lãi
- ✅ **Bán hàng**: Giỏ hàng, thanh toán, tự động trừ kho
- ✅ **Thu chi**: Theo dõi các khoản thu chi
- ✅ **Báo cáo**: Doanh thu, lợi nhuận, sản phẩm bán chạy
- ✅ **Dark mode**: Chế độ tối cho mắt
- ✅ **Responsive**: Hoạt động trên mobile

## 📊 Cấu Trúc Google Sheets

Ứng dụng tự động tạo Spreadsheet với 4 sheets:

| Sheet | Nội dung |
|-------|----------|
| Products | Danh sách sản phẩm |
| Sales | Lịch sử đơn hàng |
| Transactions | Thu chi |
| Settings | Cấu hình |

## ❓ FAQ

**Q: Tại sao không thể đăng nhập?**
A: Kiểm tra Client ID trong `config.js` và đảm bảo đã thêm localhost vào Authorized JavaScript origins.

**Q: App đang ở trạng thái "Testing"?**
A: Bạn cần thêm email test trong OAuth consent screen hoặc publish app để sử dụng với tài khoản khác.

**Q: Dữ liệu ở đâu?**
A: Trong Google Drive của bạn, tìm file có tên "QLBH - [Tên cửa hàng]".

## 📝 License

MIT License - Sử dụng tự do!
