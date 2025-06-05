import { NextResponse } from "next/server";
import { Resend } from "resend";
import { contactFormSchema } from "@/lib/schemas/contact";

export async function POST(request: Request) {
  try {
    // Check for API key
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Missing Resend API key");
    }

    // Initialize Resend with API key
    const resend = new Resend(process.env.RESEND_API_KEY);

    const body = await request.json();
    
    // Validate the request body
    const validatedData = contactFormSchema.parse(body);
    const { name, email, subject, message } = validatedData;

    // Send email using Resend
    await resend.emails.send({
      from: "PDF Merger <onboarding@resend.dev>", // Update this with your verified domain
      to: process.env.CONTACT_EMAIL || "your-email@example.com", // The email where you want to receive messages
      replyTo: email,
      subject: `Contact Form: ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    return NextResponse.json(
      { message: "Email sent successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Contact form error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 