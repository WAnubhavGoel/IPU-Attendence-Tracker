import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No image file provided" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");
        const mimeType = file.type || "image/jpeg";

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
You are analyzing a college timetable image.
Extract all classes for every day shown (Monday to Sunday).

Return ONLY a raw JSON array — no markdown, no code blocks, no explanation.

Each object must have exactly these fields:
- "dayOfWeek": one of MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
- "subjectName": full subject name as shown (e.g. "Theory of Computation", "Physics")
- "type": "LECTURE" for theory/regular class, "LAB" for practicals/lab sessions
- "count": integer — how many consecutive class periods for this slot (e.g. 2)

Important rules:
- Labs and Lectures of the same subject must be SEPARATE entries.
- Do NOT include time, room number, or faculty name.
- If a day has no classes, skip it entirely.

Example:
[
  { "dayOfWeek": "MONDAY", "subjectName": "Theory of Computation", "type": "LECTURE", "count": 2 },
  { "dayOfWeek": "MONDAY", "subjectName": "TOC", "type": "LAB", "count": 2 }
]
`;

        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64, mimeType } },
        ]);

        const raw = result.response.text().trim();
        const cleaned = raw.replace(/^```(?:json)?/gm, "").replace(/^```$/gm, "").trim();
        const parsed = JSON.parse(cleaned);

        return NextResponse.json({ slots: parsed });
      } catch (aiErr) {
        console.warn("[OCR] Gemini Vision failed, using sample fallback:", aiErr);
      }
    }

    // Fallback sample template
    const sampleSlots = [
      { dayOfWeek: "MONDAY", subjectName: "Subject 1", type: "LECTURE", count: 2 },
      { dayOfWeek: "MONDAY", subjectName: "Subject 2", type: "LAB", count: 2 },
      { dayOfWeek: "TUESDAY", subjectName: "Subject 1", type: "LECTURE", count: 1 },
      { dayOfWeek: "TUESDAY", subjectName: "Subject 3", type: "LECTURE", count: 2 },
      { dayOfWeek: "WEDNESDAY", subjectName: "Subject 2", type: "LECTURE", count: 2 },
      { dayOfWeek: "WEDNESDAY", subjectName: "Subject 4", type: "LAB", count: 2 },
      { dayOfWeek: "THURSDAY", subjectName: "Subject 1", type: "LECTURE", count: 2 },
      { dayOfWeek: "FRIDAY", subjectName: "Subject 4", type: "LECTURE", count: 2 },
      { dayOfWeek: "FRIDAY", subjectName: "Subject 5", type: "LAB", count: 2 },
    ];

    return NextResponse.json({
      slots: sampleSlots,
      notice: "Gemini API key not configured. A sample timetable has been loaded — please edit subject names and counts to match your actual schedule before saving.",
    });
  } catch (error) {
    console.error("[POST /api/timetable/ocr]", error);
    return NextResponse.json({ error: "Failed to process timetable image" }, { status: 500 });
  }
}
