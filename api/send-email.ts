/**
 * Vercel Serverless Function — POST /api/send-email
 *
 * Sends a Booking Confirmation & Payment Approved email to the Customer using Brevo (Sendinblue) REST API.
 *
 * Environment Variables (configured in Vercel / .env):
 * - BREVO_API_KEY
 * - BREVO_SENDER_EMAIL (optional, defaults to desiwardrobe07@gmail.com)
 * - BREVO_SENDER_NAME (optional, defaults to Desi Wardrobe)
 */

interface SendEmailRequestBody {
  to?: string;
  customerEmail?: string;
  email?: string;
  customerName?: string;
  customerMobile?: string;
  bookingId?: string;
  bookingReference?: string;
  productName?: string;
  size?: string;
  color?: string;
  quantity?: number;
  price?: number;
  amountPaid?: number;
  paymentAmount?: number;
  shopName?: string;
  shopMobile?: string;
  shopAddress?: string;
  shopLocationName?: string;
  pickupDeadline?: string;
  approvedAt?: string;
}

interface VercelLikeRequest {
  method?: string;
  body?: SendEmailRequestBody | string;
}

interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse;
  json: (data: Record<string, unknown>) => void;
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    res.status(200).json({
      ok: false,
      skipped: true,
      reason: 'BREVO_API_KEY is not configured in environment variables.',
    });
    return;
  }

  let payload: SendEmailRequestBody = {};
  try {
    payload =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as SendEmailRequestBody)
        : req.body || {};
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid JSON request body.' });
    return;
  }

  const recipientEmail = (
    payload.customerEmail ||
    payload.to ||
    payload.email ||
    ''
  )
    .trim()
    .toLowerCase();

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    res.status(400).json({ ok: false, error: 'Valid customerEmail is required.' });
    return;
  }

  const customerName = (payload.customerName || 'Valued Customer').trim();
  const bookingId = (payload.bookingId || payload.bookingReference || 'CONFIRMED').trim();
  const productName = (payload.productName || 'Reserved Fashion Item').trim();
  const size = (payload.size || 'Standard').trim();
  const color = (payload.color || 'Standard').trim();
  const quantity = Number(payload.quantity || 1);
  const price = Number(payload.price || 0);
  const amountPaid = Number(payload.amountPaid ?? payload.paymentAmount ?? quantity * 75);
  const shopName = (payload.shopName || 'Desi Wardrobe Partner Shop').trim();
  const shopMobile = (payload.shopMobile || '').trim();
  const shopAddress = (
    payload.shopAddress ||
    payload.shopLocationName ||
    'Local Partner Store'
  ).trim();

  const formattedDeadline = payload.pickupDeadline
    ? new Date(payload.pickupDeadline).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Within 48 hours of confirmation';

  const senderEmail = (
    process.env.BREVO_SENDER_EMAIL || 'desiwardrobe07@gmail.com'
  ).trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'Desi Wardrobe').trim();

  const subject = `Booking Confirmed (${bookingId}) — Desi Wardrobe`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5d5c5; border-radius: 16px; overflow: hidden; background-color: #faf6f0; color: #1f1209;">
      <div style="background: linear-gradient(135deg, #52151e, #2b0c10); color: #faf5f0; padding: 24px; text-align: center;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #fbbf24;">Desi Wardrobe</p>
        <h1 style="margin: 8px 0 4px; font-size: 24px;">Booking Confirmed!</h1>
        <p style="margin: 0; font-size: 13px; color: #e5c7b8;">Your payment has been verified and your outfit is reserved.</p>
      </div>

      <div style="padding: 24px;">
        <p style="margin-top: 0; font-size: 14px;">Hello <strong>${customerName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.5;">
          Great news! Your UPI booking payment of <strong>₹${amountPaid.toLocaleString('en-IN')}</strong> has been <strong>APPROVED</strong>. Please show your official Booking ID at the shop within <strong>48 hours</strong> to collect your item.
        </p>

        <div style="background-color: #ffffff; border: 2px dashed #b45309; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #78350f;">Official Booking ID</p>
          <p style="margin: 6px 0 0; font-size: 22px; font-weight: bold; font-family: monospace; color: #9a3412;">${bookingId}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #eadbce;">
          <tbody>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Payment Status</td>
              <td style="padding: 10px 14px; font-weight: bold; color: #15803d; text-align: right;">APPROVED</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Booking Status</td>
              <td style="padding: 10px 14px; font-weight: bold; color: #15803d; text-align: right;">CONFIRMED</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Product</td>
              <td style="padding: 10px 14px; font-weight: bold; text-align: right;">${productName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Size &amp; Color</td>
              <td style="padding: 10px 14px; font-weight: bold; text-align: right;">${size} · ${color}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Quantity</td>
              <td style="padding: 10px 14px; font-weight: bold; text-align: right;">${quantity}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Product Price</td>
              <td style="padding: 10px 14px; font-weight: bold; text-align: right;">₹${price.toLocaleString('en-IN')}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Booking Amount Paid</td>
              <td style="padding: 10px 14px; font-weight: bold; color: #9a3412; text-align: right;">₹${amountPaid.toLocaleString('en-IN')}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Shop Name</td>
              <td style="padding: 10px 14px; font-weight: bold; text-align: right;">${shopName}</td>
            </tr>
            ${
              shopMobile
                ? `<tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Shop Contact</td>
              <td style="padding: 10px 14px; font-weight: bold; text-align: right;">+91 ${shopMobile}</td>
            </tr>`
                : ''
            }
            <tr style="border-bottom: 1px solid #f0e4d7;">
              <td style="padding: 10px 14px; color: #6b5744;">Shop Address</td>
              <td style="padding: 10px 14px; font-weight: bold; text-align: right;">${shopAddress}</td>
            </tr>
            <tr>
              <td style="padding: 10px 14px; color: #6b5744;">48-Hour Pickup Deadline</td>
              <td style="padding: 10px 14px; font-weight: bold; color: #b45309; text-align: right;">${formattedDeadline}</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 12px; color: #6b5744; margin-top: 20px; line-height: 1.5;">
          Need help or support? Contact us at <a href="mailto:desiwardrobe07@gmail.com" style="color: #9a3412; font-weight: bold;">desiwardrobe07@gmail.com</a>.
        </p>
      </div>
    </div>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [
          {
            email: recipientEmail,
            name: customerName,
          },
        ],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(200).json({
        ok: false,
        error: `Brevo API returned status ${response.status}`,
        details: errorText,
      });
      return;
    }

    const result = (await response.json()) as Record<string, unknown>;
    res.status(200).json({ ok: true, result });
  } catch (err) {
    res.status(200).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to send email via Brevo.',
    });
  }
}
