export function wrapHtml(content: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:20px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #C19B38">
<tr><td style="background:#715E26;padding:16px 24px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="width:40px"><img src="https://via.placeholder.com/32/ffffff/715E26?text=PT" width="32" height="32" alt="" style="display:block;border-radius:2px"></td>
<td style="font-size:16px;font-weight:bold;color:#ffffff;padding-left:10px;font-family:Arial,sans-serif">Press Trust<br><span style="font-size:12px;font-weight:normal">Scholarship Management System</span></td>
</tr>
</table>
</td></tr>
<tr><td style="padding:24px 24px 16px;font-size:14px;color:#333333;line-height:1.5">
${content}
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
