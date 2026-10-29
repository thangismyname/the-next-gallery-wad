import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true", // true nếu port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Tên người dùng tự đặt → escape trước khi chèn vào HTML email.
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * @param {{ to: string, userName?: string, resetUrl: string }} params
 */
export async function sendResetPasswordEmail({ to, userName, resetUrl }) {
  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ??
      "The Next Gallery <no-reply@thenextgallery.local>",
    to,
    subject: "Đặt lại mật khẩu - The Next Gallery",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Đặt lại mật khẩu</h2>
        <p>Xin chào${userName ? ` ${escapeHtml(userName)}` : ""},</p>
        <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản này. Nhấn vào nút bên dưới để đặt mật khẩu mới:</p>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(resetUrl)}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;">
            Đặt lại mật khẩu
          </a>
        </p>
        <p>Nếu bạn không yêu cầu điều này, có thể bỏ qua email này.</p>
        <p style="color:#888;font-size:12px;">Link sẽ hết hạn sau một khoảng thời gian ngắn.</p>
      </div>
    `,
  });
}
