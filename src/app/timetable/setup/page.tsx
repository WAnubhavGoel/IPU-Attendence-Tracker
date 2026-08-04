"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"] as const;
type Day = typeof DAYS[number];

interface SlotInput {
  tempId: string;
  id?: string;
  dayOfWeek: Day;
  subjectName: string;
  type: "LECTURE" | "LAB";
  count: number;
}

function getTodayDateStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

let tc = 0;
const nid = () => `t${++tc}`;

export default function TimetablePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [slots, setSlots] = useState<SlotInput[]>([]);
  const [sessionStartDate, setSessionStartDate] = useState(getTodayDateStr());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [hasTimetable, setHasTimetable] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    fetch("/api/timetable")
      .then(r => r.json())
      .then(data => {
        if (data.sessionStartDate) {
          setSessionStartDate(data.sessionStartDate);
        }
        if (data.hasTimetable && data.slots?.length > 0) {
          setHasTimetable(true);
          setSlots(data.slots.map((s: Omit<SlotInput, "tempId">) => ({ ...s, tempId: nid() })));
          setStep(2);
        }
      })
      .catch(() => {})
      .finally(() => setPageLoading(false));
  }, []);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Please upload an image file"); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/timetable/ocr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OCR failed");
      setSlots((data.slots || []).map((s: Omit<SlotInput, "tempId">) => ({ ...s, tempId: nid() })));
      if (data.notice) setNotice(data.notice);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete your entire timetable and all attendance data? This cannot be undone.")) return;
    await fetch("/api/timetable", { method: "DELETE" });
    setSlots([]); setHasTimetable(false); setStep(1);
  };

  const addSlot = (day: Day) =>
    setSlots(p => [...p, { tempId: nid(), dayOfWeek: day, subjectName: "", type: "LECTURE", count: 1 }]);

  const upd = (tempId: string, field: keyof SlotInput, val: string | number) =>
    setSlots(p => p.map(s => s.tempId === tempId ? { ...s, [field]: val } : s));

  const rm = (tempId: string) => setSlots(p => p.filter(s => s.tempId !== tempId));

  const save = async () => {
    const valid = slots.filter(s => s.subjectName.trim());
    if (!valid.length) { setError("Add at least one subject"); return; }
    if (!sessionStartDate) { setError("Select when your session/classes start"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: valid, sessionStartDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const byDay = DAYS.reduce((acc, day) => {
    acc[day] = slots.filter(s => s.dayOfWeek === day);
    return acc;
  }, {} as Record<Day, SlotInput[]>);

  const dayLabel = (d: Day) => d.charAt(0) + d.slice(1).toLowerCase();

  if (pageLoading) {
    return (
      <div className="page-content">
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100, marginBottom: 12, borderRadius: 16 }} />)}
      </div>
    );
  }

  return (
    <div className="page-content" style={{ paddingTop: 20 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>
          {step === 1 ? <><span className="grad-text">Set Up</span> Timetable</> : <><span className="grad-text">Review</span> Schedule</>}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {step === 1 ? "Upload your college timetable image — AI will extract all classes" : "Specify when classes start and review your subjects"}
        </p>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 1 && (
        <div className="anim-fade-up">
          {notice && <div className="alert alert-warning" style={{ marginBottom: 16 }}>{notice}</div>}

          <div
            onClick={() => !loading && fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            style={{
              border: `2px dashed ${dragOver ? "var(--accent-1)" : "rgba(99,102,241,0.3)"}`,
              borderRadius: "var(--radius-lg)", padding: "52px 24px", textAlign: "center",
              cursor: loading ? "wait" : "pointer",
              background: dragOver ? "rgba(99,102,241,0.07)" : "var(--bg-card)",
              backdropFilter: "blur(20px)", transition: "all var(--transition)", marginBottom: 12,
            }}
          >
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {loading ? (
              <>
                <div style={{ color: "var(--accent-1)", display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </div>
                <p style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Gemini AI is reading your timetable...</p>
              </>
            ) : (
              <>
                <div style={{ color: "var(--accent-1)", display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <p style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 6 }}>Upload Timetable Photo</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Tap to select or drag & drop • JPG, PNG</p>
                <p style={{ color: "rgba(99,102,241,0.7)", fontSize: "0.78rem", marginTop: 6, fontWeight: 500 }}>AI will auto-extract all subjects & classes ✨</p>
              </>
            )}
          </div>

          <button className="btn btn-secondary btn-full" style={{ marginBottom: 12 }}
            onClick={() => { setSlots([{ tempId: nid(), dayOfWeek: "MONDAY", subjectName: "", type: "LECTURE", count: 1 }]); setStep(2); }}>
            Enter Manually Instead
          </button>

          {hasTimetable && (
            <div className="card card-sm" style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>Existing timetable found</p>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>View or delete your current schedule</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>View</button>
                  <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Review & Edit */}
      {step === 2 && (
        <div className="anim-fade-up">
          {notice && <div className="alert alert-warning" style={{ marginBottom: 16 }}>{notice}</div>}

          {/* SESSION / CLASSES START DATE CARD */}
          <div className="card card-sm" style={{ marginBottom: 20, background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.25)" }}>
            <label className="input-label" style={{ color: "var(--accent-1)", fontWeight: 700, fontSize: "0.85rem", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>📅</span> When did your classes / session start?
            </label>
            <input
              type="date"
              className="input"
              value={sessionStartDate}
              onChange={e => setSessionStartDate(e.target.value)}
              required
              style={{ fontWeight: 600, fontSize: "0.92rem", background: "rgba(0,0,0,0.3)" }}
            />
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 6 }}>
              Attendance tracking and stats calculation will strictly start from this date.
            </p>
          </div>

          {DAYS.map(day => {
            const ds = byDay[day];
            return (
              <div key={day} style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: ds.length ? "var(--grad-main)" : "var(--border)",
                      boxShadow: ds.length ? "0 0 8px rgba(99,102,241,0.6)" : "none",
                    }} />
                    <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{dayLabel(day)}</span>
                    {ds.length > 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{ds.length} slot{ds.length > 1 ? "s" : ""}</span>}
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ gap: 4, padding: "5px 10px" }} onClick={() => addSlot(day)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ds.length === 0 && (
                    <div style={{
                      padding: "14px 16px", borderRadius: "var(--radius-md)",
                      border: "1px dashed var(--border)",
                      color: "var(--text-muted)", fontSize: "0.82rem", textAlign: "center",
                    }}>
                      No classes — free day 🎉
                    </div>
                  )}
                  {ds.map(slot => (
                    <div key={slot.tempId} className="card card-sm">
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input
                          className="input"
                          placeholder="Subject name"
                          value={slot.subjectName}
                          onChange={e => upd(slot.tempId, "subjectName", e.target.value)}
                          style={{ flex: 1, fontSize: "0.88rem", padding: "9px 12px" }}
                        />
                        <button
                          onClick={() => rm(slot.tempId)}
                          style={{
                            flexShrink: 0, width: 36, height: 36,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                            borderRadius: "var(--radius-sm)", color: "var(--danger)",
                            cursor: "pointer", transition: "all var(--transition)",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        {(["LECTURE", "LAB"] as const).map(t => (
                          <button key={t} onClick={() => upd(slot.tempId, "type", t)}
                            style={{
                              padding: "5px 12px", borderRadius: 100, fontSize: "0.75rem", fontWeight: 600,
                              cursor: "pointer", border: "1px solid", transition: "all var(--transition)",
                              background: slot.type === t ? (t === "LECTURE" ? "rgba(99,102,241,0.2)" : "rgba(168,85,247,0.2)") : "transparent",
                              borderColor: slot.type === t ? (t === "LECTURE" ? "rgba(99,102,241,0.5)" : "rgba(168,85,247,0.5)") : "var(--border)",
                              color: slot.type === t ? (t === "LECTURE" ? "#818cf8" : "#c084fc") : "var(--text-muted)",
                            }}>
                            {t === "LECTURE" ? "📖 Lecture" : "🔬 Lab"}
                          </button>
                        ))}
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Count</span>
                          <div className="stepper">
                            <button className="stepper-btn" onClick={() => upd(slot.tempId, "count", Math.max(1, slot.count - 1))} disabled={slot.count <= 1}>−</button>
                            <span className="stepper-value">{slot.count}</span>
                            <button className="stepper-btn" onClick={() => upd(slot.tempId, "count", Math.min(6, slot.count + 1))} disabled={slot.count >= 6}>+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 10, marginTop: 4, paddingBottom: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setStep(1); setNotice(""); }}>
              ← Rescan
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
              {saving ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Saving...</>
              ) : "Save Timetable →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
