interface SendEmailParams {
  apiKey: string
  to: string
  subject: string
  html: string
}

export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'pancakemaker <noreply@pancakemaker.com>',
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }

  return res.json() as Promise<{ id: string }>
}
