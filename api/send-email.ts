import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const {
      customerEmail,
      bookingId,
      orderDate,
      shopName,
      productName,
      size,
      color,
      quantity,
      totalAmount,
      pickupDeadline,
    } = req.body || {};

    if (
      !customerEmail ||
      !bookingId ||
      !shopName ||
      !productName ||
      quantity == null ||
      totalAmount == null
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking information.",
      });
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail =
      process.env.BREVO_SENDER_EMAIL || "desiwardrobe07@gmail.com";

    if (!brevoApiKey) {
      console.error("BREVO_API_KEY is not configured.");

      return res.status(500).json({
        success: false,
        message: "Email service is not configured.",
      });
    }

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;padding:24px;background:#f8f1e7;color:#2b1717;">
        
        <h1 style="color:#8b0000;margin-bottom:8px;">
          Congratulations! 🎉
        </h1>

        <p style="font-size:16px;">
          Your order has been successfully placed with
          <strong>Desi Wardrobe</strong>.
        </p>

        <div style="background:#ffffff;border-radius:12px;padding:20px;margin-top:20px;">
          
          <h2 style="color:#8b0000;margin-top:0;">
            Booking Details
          </h2>

          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Order Date:</strong> ${orderDate || "-"}</p>
          <p><strong>Shop:</strong> ${shopName}</p>
          <p><strong>Product:</strong> ${productName}</p>
          <p><strong>Size:</strong> ${size || "-"}</p>
          <p><strong>Color:</strong> ${color || "-"}</p>
          <p><strong>Quantity:</strong> ${quantity}</p>
          <p><strong>Total Amount:</strong> ₹${totalAmount}</p>

          <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">

          <p>
            <strong>Pickup Deadline:</strong>
            ${pickupDeadline || "Within 48 hours"}
          </p>

        </div>

        <div style="margin-top:20px;padding:16px;background:#fff3cd;border-radius:10px;">
          <strong>Important:</strong>
          Please collect your order from the shop within 48 hours of confirmation.
        </div>

        <p style="margin-top:24px;">
          Thank you for choosing <strong>Desi Wardrobe</strong>.
        </p>

        <p style="color:#666;font-size:13px;">
          Local Fashion Marketplace
        </p>

      </div>
    `;

    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Desi Wardrobe",
            email: senderEmail,
          },
          to: [
            {
              email: customerEmail,
            },
          ],
          subject: `Congratulations! Your Desi Wardrobe order ${bookingId} is confirmed`,
          htmlContent: emailHtml,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Brevo error:", errorText);

      return res.status(502).json({
        success: false,
        message: "Unable to send confirmation email.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Confirmation email sent successfully.",
    });
  } catch (error) {
    console.error("Email API error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal email service error.",
    });
  }
}
