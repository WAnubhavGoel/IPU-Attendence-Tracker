"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface ScheduledSlot { id: string; subjectName: string; type: "LECTURE" | "LAB"; count: number; dayOfWeek: string; }
interface LogEntry { subjectName: string; type: string; heldCount: number; attendedCount: number; isTeacherAbsent: boolean; }
interface FormEntry { scheduledCount: number; heldCount: number; attendedCount: number; isTeacherAbsent: boolean; }

function getTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

function formatDate(ds: string) {
  const [y,m,d] = ds.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [date] = useState(getTodayStr);
  const [scheduledSlots, setScheduledSlots] = useState<ScheduledSlot[]>([]);
  const [formState, setFormState] = useState<Record<string, FormEntry>>({});
  const [isHoliday, setIsHoliday] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasTimetable, setHasTimetable] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [sessionStartDate, setSessionStartDate] = useState<string | null>(null);
  const [isBeforeSessionStart, setIsBeforeSessionStart] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/attendance?date=${date}`).then(r => r.json()),
      fetch("/api/timetable").then(r => r.json()),
    ]).then(([attData, ttData]) => {
      if (!ttData.hasTimetable) { setHasTimetable(false); setLoading(false); return; }
      setHasTimetable(true);
      const slots: ScheduledSlot[] = attData.scheduledSlots || [];
      setScheduledSlots(slots);
      setSessionStartDate(attData.sessionStartDate || ttData.sessionStartDate);
      setIsBeforeSessionStart(Boolean(attData.isBeforeSessionStart));

      const init: Record<string, FormEntry> = {};
      slots.forEach(s => {
        const key = `${s.subjectName}___${s.type}`;
        init[key] = { scheduledCount: s.count, heldCount: s.count, attendedCount: 0, isTeacherAbsent: false };
      });
      (attData.logs || []).forEach((log: LogEntry) => {
        const key = `${log.subjectName}___${log.type}`;
        if (init[key]) init[key] = { scheduledCount: init[key].scheduledCount, heldCount: log.heldCount, attendedCount: log.attendedCount, isTeacherAbsent: log.isTeacherAbsent };
      });
      setFormState(init);
      if (attData.alreadySubmitted) setSubmitted(true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [date]);

  const updateForm = (key: string, field: keyof FormEntry, val: number | boolean) => {
    setFormState(prev => {
      const e = { ...prev[key], [field]: val };
      if (field === "isTeacherAbsent" && val === true) { e.heldCount = 0; e.attendedCount = 0; }
      if (field === "heldCount") e.attendedCount = Math.min(e.attendedCount, val as number);
      return { ...prev, [key]: e };
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const logs = Object.entries(formState).map(([key, val]) => {
        const [subjectName, type] = key.split("___");
        return { subjectName, type, ...val };
      });
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, isFullDayHoliday: isHoliday, logs }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true); setEditMode(false); setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      alert("Failed to save attendance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="page-content">
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 140, marginBottom: 12, borderRadius: 16 }} />)}
    </div>
  );

  if (!hasTimetable) return (
    <div className="page-content" style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>📅</div>
      <h2 style={{ marginBottom: 8 }}>No Timetable Yet</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: "0.88rem" }}>
        Set up your weekly schedule to start tracking attendance.
      </p>
      <Link href="/timetable/setup" className="btn btn-primary" style={{ display: "inline-flex", width: "auto" }}>
        Set Up Timetable →
      </Link>
    </div>
  );

  const isFormDisabled = (submitted && !editMode) || isBeforeSessionStart;

  return (
    <div className="page-content">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes checkBounce { 0%{transform:scale(0)} 60%{transform:scale(1.25)} 100%{transform:scale(1)} }
      `}</style>

      {/* Date header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{
            background: "rgba(99,102,241,0.15)", color: "#818cf8",
            border: "1px solid rgba(99,102,241,0.3)",
            padding: "2px 10px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 700,
          }}>TODAY</span>

          {sessionStartDate && (
            <Link href="/timetable/setup" style={{ color: "var(--text-muted)", fontSize: "0.75rem", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              <span>🗓️ Session Start: {sessionStartDate}</span>
            </Link>
          )}
        </div>

        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, lineHeight: 1.2 }}>{formatDate(date)}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 4 }}>
          Hi {session?.user?.name?.split(" ")[0] || "there"} 👋 Log your classes below.
        </p>
      </div>

      {/* Before Session Start Banner */}
      {isBeforeSessionStart && (
        <div className="card" style={{ padding: "20px", marginBottom: 16, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.08)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 24 }}>🚀</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--accent-1)", marginBottom: 4 }}>
                Session Starts On {sessionStartDate}
              </p>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                Attendance tracking and daily questions will begin on your session start date.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save success toast */}
      {saveSuccess && (
        <div className="alert alert-success" style={{ marginBottom: 16, animation: "slideDown 0.3s ease" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "checkBounce 0.4s ease" }}><polyline points="20 6 9 17 4 12"/></svg>
          Attendance saved! ✨
        </div>
      )}

      {/* Already submitted banner */}
      {submitted && !editMode && !saveSuccess && !isBeforeSessionStart && (
        <div className="alert alert-info" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>✅ Attendance logged for today</span>
          <button style={{ background: "rgba(255,255,255,0.1)", color: "inherit", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }} onClick={() => setEditMode(true)}>Edit</button>
        </div>
      )}

      {/* No classes */}
      {scheduledSlots.length === 0 && !isBeforeSessionStart && (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
          <h2 style={{ marginBottom: 6 }}>No Classes Today!</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Enjoy your free day. Your attendance won't be affected.</p>
        </div>
      )}

      {/* Holiday toggle */}
      {scheduledSlots.length > 0 && !isBeforeSessionStart && (
        <div
          className="card"
          style={{
            marginBottom: 16, cursor: isFormDisabled ? "default" : "pointer",
            border: isHoliday ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
            background: isHoliday ? "rgba(245,158,11,0.07)" : "var(--bg-card)",
            transition: "all var(--transition)",
          }}
          onClick={() => !isFormDisabled && setIsHoliday(h => !h)}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>{isHoliday ? "🏖️" : "📅"}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: "0.95rem" }}>Mark as Holiday</p>
                <p style={{ color: isHoliday ? "rgba(245,158,11,0.7)" : "var(--text-muted)", fontSize: "0.75rem" }}>
                  {isHoliday ? "All classes skipped from calculation" : "College closed? Toggle to skip today"}
                </p>
              </div>
            </div>
            <div
              className={`toggle-track ${isHoliday ? "on" : ""}`}
              style={{ background: isHoliday ? "#f59e0b" : undefined }}
              onClick={e => { e.stopPropagation(); !isFormDisabled && setIsHoliday(h => !h); }}
            >
              <div className="toggle-thumb" />
            </div>
          </div>
        </div>
      )}

      {/* Class cards */}
      {!isBeforeSessionStart && (
        <div className="stagger">
          {scheduledSlots.map(slot => {
            const key = `${slot.subjectName}___${slot.type}`;
            const entry = formState[key] || { scheduledCount: slot.count, heldCount: slot.count, attendedCount: 0, isTeacherAbsent: false };
            const disabled = isFormDisabled || isHoliday;

            return (
              <div
                key={key}
                className="card anim-fade-up"
                style={{
                  marginBottom: 12, opacity: isHoliday ? 0.35 : 1,
                  pointerEvents: isHoliday ? "none" : "auto",
                  border: entry.isTeacherAbsent ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--border)",
                  transition: "all 0.25s ease",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "1rem" }}>{slot.subjectName}</p>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 2 }}>
                      {entry.scheduledCount} {slot.type === "LECTURE" ? "lecture" : "lab"}{entry.scheduledCount > 1 ? "s" : ""} scheduled
                    </p>
                  </div>
                  <span className={`badge ${slot.type === "LECTURE" ? "badge-lecture" : "badge-lab"}`}>
                    {slot.type === "LECTURE" ? "📖 Lecture" : "🔬 Lab"}
                  </span>
                </div>

                {/* Classes held section */}
                <div style={{ marginBottom: 14 }}>
                  <p className="section-label" style={{ marginBottom: 8 }}>Classes held today</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="stepper">
                      <button className="stepper-btn"
                        disabled={disabled || entry.isTeacherAbsent || entry.heldCount <= 0}
                        onClick={() => updateForm(key, "heldCount", Math.max(0, entry.heldCount - 1))}>−</button>
                      <span className="stepper-value">{entry.isTeacherAbsent ? 0 : entry.heldCount}</span>
                      <button className="stepper-btn"
                        disabled={disabled || entry.isTeacherAbsent || entry.heldCount >= entry.scheduledCount}
                        onClick={() => updateForm(key, "heldCount", Math.min(entry.scheduledCount, entry.heldCount + 1))}>+</button>
                    </div>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>out of {entry.scheduledCount}</span>
                  </div>
                </div>

                {/* Teacher absent */}
                <div
                  className="toggle-container"
                  style={{ marginBottom: entry.isTeacherAbsent ? 12 : 14, pointerEvents: disabled ? "none" : "auto" }}
                  onClick={() => !disabled && updateForm(key, "isTeacherAbsent", !entry.isTeacherAbsent)}
                >
                  <div className={`toggle-track ${entry.isTeacherAbsent ? "on" : ""}`} style={{ background: entry.isTeacherAbsent ? "var(--danger)" : undefined }}>
                    <div className="toggle-thumb" />
                  </div>
                  <span className="toggle-label" style={{ color: entry.isTeacherAbsent ? "var(--danger)" : undefined }}>
                    🚫 Teacher Absent / Class Cancelled
                  </span>
                </div>

                {/* Teacher absent notice */}
                {entry.isTeacherAbsent && (
                  <div style={{ padding: "9px 12px", borderRadius: "var(--radius-sm)", background: "rgba(239,68,68,0.07)", color: "var(--danger)", fontSize: "0.78rem", fontWeight: 500 }}>
                    This class won't count towards your total — you&apos;re safe! 👍
                  </div>
                )}

                {/* Attendance chips */}
                {!entry.isTeacherAbsent && entry.heldCount > 0 && (
                  <div>
                    <p className="section-label" style={{ marginBottom: 8 }}>How many did you attend?</p>
                    <div className="att-chips">
                      {Array.from({ length: entry.heldCount + 1 }, (_, i) => (
                        <button
                          key={i}
                          className={`att-chip ${entry.attendedCount === i ? "selected" : ""}`}
                          disabled={disabled}
                          onClick={() => !disabled && updateForm(key, "attendedCount", i)}
                        >{i}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submit button */}
      {scheduledSlots.length > 0 && (!submitted || editMode) && !isBeforeSessionStart && (
        <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: 8 }} onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Saving...</>
          ) : "✓ Save Today's Attendance"}
        </button>
      )}
    </div>
  );
}
