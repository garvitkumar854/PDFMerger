import { NextResponse } from "next/server";
import { Resend } from "resend";
import { contactFormSchema } from "@/lib/schemas/contact";
import { ErrorResponse as EmailError } from "resend";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { z } from "zod";

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
  maxRequests: 5
});

const EmailDataSchema = z.object({
  from: z.string().min(1),
  to: z.string().email(),
  replyTo: z.string().email(),
  subject: z.string().min(1).max(100),
  html: z.string().min(1)
});

type EmailData = z.infer<typeof EmailDataSchema>;

interface EmailResponse {
  id: string;
}

interface ErrorDetail {
  code: number;
  message: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

interface ApiResponse {
  success?: boolean;
  error?: string;
  id?: string;
}

type ResendErrorType = EmailError & {
  statusCode?: number;
  message: string;
};

const isResendError = (error: unknown): error is ResendErrorType => {
  return error instanceof Error && 'statusCode' in error;
};

async function validateEmailData(data: EmailData): Promise<void> {
  try {
    await EmailDataSchema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid email data: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }

  if (!emailRegex.test(data.to) || !emailRegex.test(data.replyTo)) {
    throw new Error('Invalid email format');
  }
}

async function sendEmailWithRetry(resend: Resend, emailData: EmailData, retries = MAX_RETRIES): Promise<EmailResponse> {
  await validateEmailData(emailData);
  try {
    const result = await resend.emails.send(emailData);
    if (!('id' in result)) {
      throw new Error('Email sent but no ID returned');
    }
    return { id: result.id as string };
  } catch (error) {
    if (retries > 0 && isResendError(error) && error.statusCode && error.statusCode >= 500) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return sendEmailWithRetry(resend, emailData, retries - 1);
    }
    throw error;
  }
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim()
    .slice(0, 1000); // Limit length
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    try {
      await limiter.check();
    } catch (error) {
      if (error instanceof Error && error.name === 'RateLimitError') {
        const headers = {
          'Retry-After': '60',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
        };
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers }
        );
      }
      
      console.error("Rate limit error:", error);
      return NextResponse.json(
        { error: "Rate limit configuration error" },
        { status: 500 }
      );
    }
    // Check for API key
    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY environment variable");
      return NextResponse.json(
        { error: "Email service configuration error" },
        { status: 500 }
      );
    }

    // Check for contact email
    if (!process.env.CONTACT_EMAIL) {
      console.error("Missing CONTACT_EMAIL environment variable");
      return NextResponse.json(
        { error: "Email service configuration error" },
        { status: 500 }
      );
    }

    // Initialize Resend with API key
    const resend = new Resend(process.env.RESEND_API_KEY);

    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error("Failed to parse request body:", error);
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Validate the request body
    let validatedData;
    try {
      validatedData = contactFormSchema.parse(body);
    } catch (error) {
      console.error("Validation error:", error);
      return NextResponse.json(
        { error: "Invalid form data" },
        { status: 400 }
      );
    }

    const { name, email, subject, message } = validatedData;
    
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Sanitize all input fields
    const sanitizedName = sanitizeInput(name);
    const sanitizedSubject = sanitizeInput(subject);
    const sanitizedMessage = sanitizeInput(message);

    // Validate lengths after sanitization
    if (!sanitizedName || !sanitizedSubject || !sanitizedMessage) {
      return NextResponse.json(
        { error: "Required fields cannot be empty after sanitization" },
        { status: 400 }
      );
    }

    try {
      // Send email using Resend with retry mechanism
      const result = await sendEmailWithRetry(resend, {
        from: "PDFMerger Contact <onboarding@resend.dev>",
        to: process.env.CONTACT_EMAIL,
        replyTo: email,
        subject: sanitizedSubject,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>New Contact Form Submission</title>
            </head>
            <body>
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333; margin-bottom: 20px;">New Contact Form Submission</h2>
                <p style="margin: 10px 0;"><strong>From:</strong> ${sanitizedName} (${email})</p>
                <p style="margin: 10px 0;"><strong>Subject:</strong> ${sanitizedSubject}</p>
                <div style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
                  <p style="margin: 0 0 10px;"><strong>Message:</strong></p>
                  <p style="white-space: pre-wrap; margin: 0;">${sanitizedMessage}</p>
                </div>
              </div>
            </body>
          </html>
        `
      });

      const remaining = await limiter.remaining();
      const headers = {
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": remaining.toString(),
        "X-RateLimit-Reset": new Date(Date.now() + 60000).toISOString()
      };

      return NextResponse.json(
        { success: true, id: result.id },
        { status: 200, headers }
      );
    } catch (error) {
      console.error('Error sending email:', error);
      const { code, message } = getErrorDetails(error);
      return NextResponse.json({ error: message }, { status: code });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

function getErrorDetails(error: unknown): ErrorDetail {
  if (error instanceof z.ZodError) {
    return { 
      code: 400, 
      message: `Validation error: ${error.errors.map(e => e.message).join(', ')}` 
    };
  }

  if (isResendError(error)) {
    switch (error.statusCode) {
      case 429:
        return { code: 429, message: "Too many requests. Please try again later." };
      case 401:
        return { code: 401, message: "Invalid API key" };
      case 400:
        return { code: 400, message: "Invalid email configuration" };
      default:
        if (error.message.includes("Invalid email")) {
          return { code: 400, message: error.message };
        }
        return { code: 500, message: "Email service error" };
    }
  }

  if (error instanceof Error) {
    return { code: 400, message: error.message };
  }

  return { code: 500, message: "An unexpected error occurred" };
}