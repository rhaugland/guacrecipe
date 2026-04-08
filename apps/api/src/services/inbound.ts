export function extractInboundSms(payload: any) {
  const from = payload.data?.payload?.from?.phone_number;
  let body = payload.data?.payload?.text ?? "";
  let forceDisambiguate = false;

  if (body.startsWith("? ")) {
    forceDisambiguate = true;
    body = body.slice(2);
  }

  return { senderPhone: from, body, forceDisambiguate };
}

export function extractInboundEmail(payload: any) {
  let body = payload.text ?? "";
  let forceDisambiguate = false;

  if (body.startsWith("? ")) {
    forceDisambiguate = true;
    body = body.slice(2);
  }

  return {
    senderEmail: payload.from,
    body,
    subject: payload.subject ?? "",
    forceDisambiguate,
  };
}
