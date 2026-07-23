export function otpEmailHtml(code: string, minutes: number): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:20px 0">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #C19B38">
<tr><td style="background:#715E26;padding:16px 24px;font-size:16px;font-weight:bold;color:#ffffff;text-align:center">
Press Trust Scholarship Management System
</td></tr>
<tr><td style="padding:32px 24px 24px;font-size:14px;color:#333333;line-height:1.5;text-align:center">
<p style="margin:0 0 16px">Your verification code</p>
<div style="background:#f5f0e0;border:1px solid #C19B38;border-radius:4px;padding:16px;margin:0 auto 16px;width:200px;text-align:center;font-size:36px;font-weight:bold;letter-spacing:8px;color:#715E26;font-family:Courier,monospace">${code}</div>
<p style="margin:0 0 8px;font-size:13px;color:#666666">This code expires in ${minutes} minutes.</p>
<p style="margin:0;font-size:12px;color:#999999">If you didn't request this code, please ignore this email.</p>
</td></tr>
<tr><td style="background:#f5f0e0;padding:12px 24px;border-top:1px solid #C19B38;font-size:11px;color:#715E26;text-align:center">
Press Trust Scholarship Management System
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
