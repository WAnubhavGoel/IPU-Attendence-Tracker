"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error("Invalid email or password");
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => signIn("google", { callbackUrl: "/dashboard" });

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Animated background orbs */}
      <div style={{
        position: "fixed", top: "-20%", left: "-10%",
        width: "500px", height: "500px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%)",
        pointerEvents: "none", zIndex: 0,
        animation: "pulse 6s ease-in-out infinite alternate",
      }} />
      <div style={{
        position: "fixed", bottom: "-10%", right: "-10%",
        width: "400px", height: "400px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 65%)",
        pointerEvents: "none", zIndex: 0,
        animation: "pulse 8s ease-in-out infinite alternate-reverse",
      }} />
      <style>{`
        @keyframes pulse { from { transform: scale(1) } to { transform: scale(1.15) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }} className="anim-fade-up">

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: "var(--grad-main)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
            boxShadow: "0 8px 32px rgba(99,102,241,0.4)",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1 className="grad-text" style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 6 }}>IPU Tracker</h1>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{
              background: "rgba(99,102,241,0.15)", color: "#818cf8",
              border: "1px solid rgba(99,102,241,0.3)",
              padding: "3px 10px", borderRadius: 100, fontSize: "0.72rem", fontWeight: 700,
            }}>Attendance Tracker</span>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 8 }}>
            Track attendance. Stay safe from shortage.
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "24px 20px" }}>

          {/* Tab switcher */}
          <div className="tabs" style={{ marginBottom: 20 }}>
            <button className={`tab-btn ${tab === "signin" ? "active" : ""}`} onClick={() => { setTab("signin"); setError(""); }}>
              Sign In
            </button>
            <button className={`tab-btn ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); setError(""); }}>
              Create Account
            </button>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogle}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, padding: "12px", borderRadius: "var(--radius-md)",
              background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
              color: "var(--text-primary)", fontSize: "0.9rem", fontWeight: 600,
              cursor: "pointer", transition: "all var(--transition)", marginBottom: 16,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="divider" style={{ marginBottom: 16 }}>or continue with email</div>

          {/* Error */}
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 14 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tab === "register" && (
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <div className="input-with-icon">
                  <span className="input-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                  <input className="input" type="text" placeholder="Rahul Sharma" value={name} onChange={e => setName(e.target.value)} required />
                </div>
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Email Address</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input className="input" type="email" placeholder="student@ipu.ac.in" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-full btn-lg"
              style={{ marginTop: 4 }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  {tab === "register" ? "Creating account..." : "Signing in..."}
                </>
              ) : (
                <>
                  {tab === "register" ? "Create Account" : "Sign In"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Secured for IPU students · Your data stays private
        </p>
      </div>
    </div>
  );
}
