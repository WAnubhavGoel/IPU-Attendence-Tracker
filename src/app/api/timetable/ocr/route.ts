import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/get-user-id";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = `
You are an expert OCR system specializing in Indian college and university timetables (e.g., IPU, DU, AKTU).
Analyze the timetable image provided and extract all scheduled classes for every day (Monday to Sunday).

Follow these strict rules:

1. **SUBJECT NAMES**:
   - Extract clean, human-readable subject names (e.g., "OS Theory", "DBMS", "DAA Lab", "Java Theory", "Principles of Management", "Comp Org and Arch", "COA Theory", "OS Lab", "Java Lab").
   - Strip out room numbers, building codes, and floor codes (e.g., ignore "ECR-110", "PC-209", "ETL313", "DTL217", "PC-201", "AEC-211", "PC203", "PC-205", "PC-207", "ETL312", "ETL219").
   - Strip out student group/batch markers (e.g., "Grp A:", "Grp B:", "Group 1", "Batch A").
   - If a slot lists different labs for Grp A and Grp B (e.g., "Grp A: DAA Lab / Grp B: DBMS Lab"), extract both subjects ("DAA Lab" and "DBMS Lab") as separate slots.

2. **TYPE (LECTURE vs LAB)**:
   - If the subject name contains "Lab", "lab", "Practical", or "P", set "type" to "LAB".
   - Otherwise, set "type" to "LECTURE".

3. **COUNT (NUMBER OF PERIODS)**:
   - Calculate how many 1-hour class periods the session spans based on column time headers (e.g., 9:00-11:00 = 2 periods -> count: 2; 1:30-3:30 = 2 periods -> count: 2; 1:30-2:30 = 1 period -> count: 1).
   - If duration is not clear, default count to 1.

4. **DAY OF WEEK**:
   - Must be one of: "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY".

5. **OUTPUT FORMAT**:
   - Return ONLY a raw JSON array — no markdown formatting, no code blocks, no intro, no explanation.

Example JSON output format:
[
  { "dayOfWeek": "MONDAY", "subjectName": "OS Theory", "type": "LECTURE", "count": 2 },
  { "dayOfWeek": "MONDAY", "subjectName": "Principles of Management", "type": "LECTURE", "count": 2 },
  { "dayOfWeek": "WEDNESDAY", "subjectName": "DAA Lab", "type": "LAB", "count": 2 },
  { "dayOfWeek": "WEDNESDAY", "subjectName": "DBMS Lab", "type": "LAB", "count": 2 }
]
`;

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No image file provided" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY environment variable is not configured in Vercel settings" }, { status: 500 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const genAI = new GoogleGenerativeAI(apiKey);

    let lastError: unknown = null;
    let rawText = "";

    // Try Gemini Vision models in order
    for (const modelName of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          PROMPT,
          { inlineData: { data: base64, mimeType } },
        ]);

        rawText = result.response.text().trim();
        if (rawText) break;
      } catch (err) {
        console.warn(`[OCR] Gemini model ${modelName} failed:`, err);
        lastError = err;
      }
    }

    if (!rawText) {
      throw lastError || new Error("All Gemini Vision models failed to respond");
    }

    // Clean JSON output (remove ```json wrappers and whitespace)
    const cleaned = rawText
      .replace(/^```(?:json)?/gm, "")
      .replace(/^```$/gm, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ error: "Could not detect any class slots in image. Please try a clearer photo." }, { status: 400 });
    }

    // Normalize slots
    const validDays = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
    const normalizedSlots = parsed.map((s: { dayOfWeek?: string; subjectName?: string; type?: string; count?: number }) => {
      const day = (s.dayOfWeek || "MONDAY").toUpperCase();
      const subjectName = (s.subjectName || "Subject").trim();
      const isLab = s.type === "LAB" || /lab|practical/i.test(subjectName);

      return {
        dayOfWeek: validDays.has(day) ? day : "MONDAY",
        subjectName,
        type: isLab ? "LAB" : "LECTURE",
        count: Math.max(1, Number(s.count) || 1),
      };
    });

    return NextResponse.json({ slots: normalizedSlots });
  } catch (error) {
    console.error("[POST /api/timetable/ocr]", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to process timetable image with AI",
    }, { status: 500 });
  }
}
