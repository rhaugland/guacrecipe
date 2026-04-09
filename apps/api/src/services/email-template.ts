const APP_URL = process.env.APP_URL ?? "https://guacwithme.com";

export function wrapEmailHtml(body: string, options?: { ctaText?: string; ctaUrl?: string; recipientId?: string }): string {
  const joinUrl = options?.recipientId ? `${APP_URL}/join?ref=${options.recipientId}` : `${APP_URL}/join`;
  const cta = options?.ctaUrl
    ? `<tr><td style="padding: 24px 0 0 0;" align="center">
        <a href="${options.ctaUrl}" style="display:inline-block;padding:14px 32px;background-color:#4A7C59;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;font-size:16px;">${options.ctaText ?? "Open Guac"}</a>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FFFDF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFDF7;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:48px;">🥑</span>
        </td></tr>
        <!-- Card -->
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr><td style="padding:32px;">
              <!-- Body -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="color:#1a1a1a;font-size:15px;line-height:24px;white-space:pre-wrap;">${body}</td></tr>
                ${cta}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td align="center" style="padding:24px 0 0 0;color:#9ca3af;font-size:12px;line-height:18px;">
          Sent via <a href="${joinUrl}" style="color:#4A7C59;text-decoration:none;font-weight:600;">Guac</a> — manage how people reach you
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
