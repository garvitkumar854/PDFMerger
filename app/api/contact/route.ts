import { NextResponse } from "next/server";
import { Resend } from "resend";
import { contactFormSchema } from "@/lib/schemas/contact";

export async function POST(request: Request) {
  try {
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

    try {
      // Send email using Resend
      const result = await resend.emails.send({
        from: "PDF Merger <onboarding@resend.dev>",
        to: process.env.CONTACT_EMAIL,
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

      console.log("Email sent successfully:", result);

      return NextResponse.json(
        { message: "Email sent successfully" },
        { status: 200 }
      );
    } catch (error) {
      console.error("Failed to send email:", error);
      return NextResponse.json(
        { error: "Failed to send email. Please try again later." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
} 