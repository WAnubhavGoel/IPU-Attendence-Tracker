"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface SubjectStat {
  subjectName: string;
  type: "LECTURE" | "LAB";
  totalHeld: number;
  totalAttended: number;
  percentage: number;
  status: "SAFE" | "WARNING" | "CRITICAL";
  bunkMargin: number;
  recoveryCount: number;
}

interface GroupSummary {
  subjects: SubjectStat[];
  totalHeld: number;
  totalAttended: number;
  percentage: number;
  bunkMargin: number;
  recoveryCount: number;
  status: "SAFE" | "WARNING" | "CRITICAL";
}

interface AnalyticsData {
  overview: {
    overallPercentage: number;
    theoryPercentage: number;
    labPercentage: number;
    totalHeld: number;
    totalAttended: number;
    theoryHeld: number;
    theoryAttended: number;
    labHeld: number;
    labAttended: number;
    bunkMargin: number;
    recoveryCount: number;
    status: "SAFE" | "WARNING" | "CRITICAL";
  };
  theory: GroupSummary;
  labs: GroupSummary;
  subjects: SubjectStat[];
}

function CircularProgress({ pct }: { pct: number }) {
  const r = 76;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = circ - (clamped / 100) * circ;
  const halfOffset = circ * 0.5;
  const color = pct >= 60 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <svg width="200" height="200" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
      <circle
        cx="100" cy="100" r={r} fill="none"
        stroke={color} strokeWidth="14" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 100 100)"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.5s" }}
      />
      <circle
        cx="100" cy="100" r={r} fill="none"
        stroke="rgba(245,158,11,0.5)" strokeWidth="3"
        strokeDasharray={`5 ${circ - 5}`}
        strokeDashoffset={halfOffset}
        transform="rotate(-90 100 100)"
        strokeLinecap="round"
      />
      <text x="100" y="88" textAnchor="middle" fill="white" fontSize="32" fontWeight="800" fontFamily="Inter,sans-serif">
        {Math.round(pct)}%
      </text>
      <text x="100" y="112" textAnchor="middle" fill="#9494b8" fontSize="13" fontWeight="600" fontFamily="Inter,sans-serif">
        Overall
      </text>
      <text x="100" y="132" textAnchor="middle" fill="rgba(245,158,11,0.85)" fontSize="10" fontWeight="600" fontFamily="Inter,sans-serif">
        ↑ 50% limit
      </text>
    </svg>
  );
}

function SubjectCard({ sub }: { sub: SubjectStat }) {
  const statusColor = sub.status === "SAFE" ? "var(--success)" : sub.status === "WARNING" ? "var(--warning)" : "var(--danger)";
  const progressGrad = sub.status === "SAFE"
    ? "linear-gradient(90deg, #059669, #10b981)"
    : sub.status === "WARNING"
    ? "linear-gradient(90deg, #d97706, #f59e0b)"
    : "linear-gradient(90deg, #dc2626, #ef4444)";

  return (
    <div className="card card-sm anim-fade-up" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: "0.92rem" }}>{sub.subjectName}</p>
          <span className={`badge ${sub.type === "LECTURE" ? "badge-lecture" : "badge-lab"}`} style={{ marginTop: 4, display: "inline-flex" }}>
            {sub.type === "LECTURE" ? "📖 Lecture" : "🔬 Lab"}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "1.3rem", fontWeight: 800, color: statusColor, lineHeight: 1 }}>{Math.round(sub.percentage)}%</p>
          <span className={`badge badge-${sub.status.toLowerCase()}`} style={{ marginTop: 4, display: "inline-flex" }}>
            {sub.status}
          </span>
        </div>
      </div>

      <div className="progress-bar" style={{ marginBottom: 8 }}>
        <div className="progress-fill" style={{ width: `${Math.min(100, sub.percentage)}%`, background: progressGrad }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.78rem" }}>
        <span style={{ color: "var(--text-muted)" }}>{sub.totalAttended}/{sub.totalHeld} classes</span>
        <span style={{
          padding: "4px 8px", borderRadius: "var(--radius-sm)", fontWeight: 600,
          background: sub.status === "SAFE" ? "rgba(16,185,129,0.08)" : sub.status === "WARNING" ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)",
          color: statusColor,
        }}>
          {sub.status === "SAFE" && `✅ Can skip ${sub.bunkMargin} more`}
          {sub.status === "WARNING" && `⚠️ Can skip ${sub.bunkMargin} more`}
          {sub.status === "CRITICAL" && `🚨 Attend ${sub.recoveryCount} more for 50%`}
        </span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmMode, setConfirmMode] = useState<"NONE" | "RESET_ATTENDANCE" | "NEW_SESSION">("NONE");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/analytics")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleResetAttendance = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/reset", { method: "POST" });
      setConfirmMode("NONE");
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNewSession = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/timetable", { method: "DELETE" });
      router.push("/timetable/setup");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="page-content">
      {[1,2,3,4].map(i => (
        <div key={i} className="skeleton" style={{ height: i === 1 ? 240 : 100, marginBottom: 12, borderRadius: 16 }} />
      ))}
    </div>
  );

  const isEmpty = !data?.subjects?.length;

  return (
    <div className="page-content">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>
          <span className="grad-text">Attendance</span> Analytics
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>IPU 50% Mandatory Rule Tracker</p>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="card" style={{ textAlign: "center", padding: "52px 20px" }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>📊</div>
          <h2 style={{ marginBottom: 8 }}>No Data Yet</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: "0.88rem" }}>
            Log your daily attendance to see your stats here.
          </p>
          <Link href="/dashboard" className="btn btn-primary">Log Today's Attendance</Link>
        </div>
      )}

      {!isEmpty && data && (
        <>
          {/* 1. OVERALL ATTENDANCE CARD WITH BUNK / RECOVERY MARGIN */}
          <div className="card" style={{ textAlign: "center", marginBottom: 20, padding: "24px 20px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <CircularProgress pct={data.overview.overallPercentage} />
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", fontWeight: 600, marginBottom: 12 }}>
              Overall: {data.overview.totalAttended} attended out of {data.overview.totalHeld} held ({data.overview.overallPercentage}%)
            </p>

            {/* OVERALL BUNK MARGIN / RECOVERY COUNT BANNER */}
            {data.overview.overallPercentage >= 50 ? (
              <div className="alert alert-success" style={{ textAlign: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.88rem" }}>
                ✅ You can safely skip {data.overview.bunkMargin} overall classes to stay above 50%
              </div>
            ) : (
              <div className="alert alert-danger" style={{ textAlign: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.88rem" }}>
                🚨 You need to attend {data.overview.recoveryCount} overall classes to reach 50%
              </div>
            )}
          </div>

          {/* 2. THEORY / NORMAL CLASSES SECTION */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--accent-1)" }}>
                📖 Normal / Theory Classes
              </h3>
              <span className={`badge badge-${data.theory.status?.toLowerCase() || "safe"}`}>
                {data.theory.percentage}% Overall
              </span>
            </div>

            {/* Theory Group Summary Card */}
            <div className="card card-sm" style={{ marginBottom: 12, background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>Theory Overall Attendance</p>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 2 }}>
                    {data.theory.totalAttended} / {data.theory.totalHeld} total lectures attended
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--accent-1)" }}>{data.theory.percentage}%</p>
                  <p style={{ fontSize: "0.72rem", color: data.theory.percentage >= 50 ? "var(--success)" : "var(--danger)", fontWeight: 600, marginTop: 2 }}>
                    {data.theory.percentage >= 50 ? `Can skip ${data.theory.bunkMargin} lectures` : `Need ${data.theory.recoveryCount} for 50%`}
                  </p>
                </div>
              </div>
            </div>

            {/* Individual Theory Subject Cards */}
            {data.theory.subjects.map(sub => (
              <SubjectCard key={`${sub.subjectName}-${sub.type}`} sub={sub} />
            ))}
          </div>

          {/* 3. LABS SECTION */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--accent-2)" }}>
                🔬 Lab Practicals
              </h3>
              <span className={`badge badge-${data.labs.status?.toLowerCase() || "safe"}`}>
                {data.labs.percentage}% Overall
              </span>
            </div>

            {/* Labs Group Summary Card */}
            <div className="card card-sm" style={{ marginBottom: 12, background: "rgba(168,85,247,0.06)", borderColor: "rgba(168,85,247,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>Labs Overall Attendance</p>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 2 }}>
                    {data.labs.totalAttended} / {data.labs.totalHeld} total lab practicals attended
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--accent-2)" }}>{data.labs.percentage}%</p>
                  <p style={{ fontSize: "0.72rem", color: data.labs.percentage >= 50 ? "var(--success)" : "var(--danger)", fontWeight: 600, marginTop: 2 }}>
                    {data.labs.percentage >= 50 ? `Can skip ${data.labs.bunkMargin} labs` : `Need ${data.labs.recoveryCount} for 50%`}
                  </p>
                </div>
              </div>
            </div>

            {/* Individual Lab Subject Cards */}
            {data.labs.subjects.map(sub => (
              <SubjectCard key={`${sub.subjectName}-${sub.type}`} sub={sub} />
            ))}
          </div>

          {/* 4. ACTIONS / RESET BUTTONS */}
          {confirmMode === "NONE" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setConfirmMode("RESET_ATTENDANCE")}>
                🔄 Reset Attendance Only (Keep Timetable)
              </button>
              <button className="btn btn-danger btn-full" onClick={() => setConfirmMode("NEW_SESSION")}>
                🚀 Start New Session (Erase Everything & Start Fresh)
              </button>
            </div>
          )}

          {/* RESET ATTENDANCE CONFIRMATION */}
          {confirmMode === "RESET_ATTENDANCE" && (
            <div className="card" style={{ border: "1px solid rgba(245,158,11,0.35)", marginBottom: 12 }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>🔄 Reset Attendance Logs Only?</p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 16 }}>
                All daily attendance logs will be cleared. Your timetable and session start date will be kept intact so you can log again from today.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmMode("NONE")}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleResetAttendance} disabled={submitting}>
                  {submitting ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : "Yes, Reset Attendance"}
                </button>
              </div>
            </div>
          )}

          {/* START NEW SESSION CONFIRMATION */}
          {confirmMode === "NEW_SESSION" && (
            <div className="card" style={{ border: "1px solid rgba(239,68,68,0.35)", marginBottom: 12, background: "rgba(239,68,68,0.06)" }}>
              <p style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>🚀 Start New Session (Erase Everything)?</p>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginBottom: 16 }}>
                This will completely erase your timetable, session start date, and all attendance records. You will be redirected to set up a new timetable from scratch.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmMode("NONE")}>Cancel</button>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleStartNewSession} disabled={submitting}>
                  {submitting ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : "Erase All & Start Fresh"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
