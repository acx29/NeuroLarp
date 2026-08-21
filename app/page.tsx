"use client";
//**
// app/page.tsx
// Login screen: ocean photo + overlay, wordmark, center links, auth modal (signup/login)
//**
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [modal, setModal] = useState<Mode | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (m: Mode) => {
    setModal(m);
    setError("");
    setNotice("");
  };

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = supabaseBrowser();
    try {
      if (modal === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Check your email to confirm your account, then log in.");
          return;
        }
        router.push("/home");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/home");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [busy, modal, email, password, username, router]);

  const isSignup = modal === "signup";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0B0B0E", overflow: "hidden" }}>
      <style>{`.nl-a:hover{color:#33506B!important}`}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(/login-bg.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(9,9,13,0.40)", pointerEvents: "none" }} />
      <div
        className="nl-wordmark"
        style={{
          position: "absolute",
          top: 26,
          left: 34,
          fontSize: 29,
          letterSpacing: "-0.01em",
          color: "#FFFFFF",
          pointerEvents: "none",
        }}
      >
        neurolarp.
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 500, color: "#FFFFFF", letterSpacing: "0.005em" }}>
          Become Aphex Twin.
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: "#FFFFFF",
            pointerEvents: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <a className="nl-a" onClick={() => open("login")} style={{ cursor: "pointer", color: "#FFFFFF" }}>
            Login
          </a>
          <span style={{ opacity: 0.75 }}>|</span>
          <a className="nl-a" onClick={() => open("signup")} style={{ cursor: "pointer", color: "#FFFFFF" }}>
            Sign up
          </a>
        </div>
      </div>

      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,12,16,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            animation: "nl-fade .15s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 384,
              background: "var(--sf)",
              borderRadius: 14,
              boxShadow: "0 24px 64px rgba(0,0,0,.28)",
              padding: "34px 32px 28px",
              animation: "nl-pop .18s ease",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-0.01em" }}>
              {isSignup ? "Create your account" : "Welcome back"}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--tx3)", margin: "6px 0 22px" }}>
              {isSignup ? "Notes in. Mental map out." : "Log in to your mental map."}
            </div>
            {isSignup && (
              <Field label="Username" value={username} onChange={setUsername} placeholder="aphextwin" />
            )}
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@neurolarp.com" type="email" />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              type="password"
              onEnter={submit}
              last
            />
            {error && (
              <div style={{ fontSize: 12.5, color: "#DC2626", marginBottom: 12 }}>{error}</div>
            )}
            {notice && (
              <div style={{ fontSize: 12.5, color: "var(--nl-accent)", marginBottom: 12 }}>{notice}</div>
            )}
            <button
              onClick={submit}
              disabled={busy}
              style={{
                width: "100%",
                height: 38,
                border: "none",
                borderRadius: 8,
                background: "var(--nl-accent)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "…" : "Continue"}
            </button>
            <div style={{ fontSize: 13, color: "var(--tx3)", textAlign: "center", marginTop: 18 }}>
              {isSignup ? "Already have an account? " : "New here? "}
              <a
                onClick={() => open(isSignup ? "login" : "signup")}
                style={{ fontWeight: 600, color: "var(--tx)", cursor: "pointer" }}
              >
                {isSignup ? "Log in" : "Sign up"}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  onEnter?: () => void;
  last?: boolean;
}) {
  return (
    <div style={{ marginBottom: props.last ? 22 : 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 550, color: "var(--tx3)", marginBottom: 6 }}>
        {props.label}
      </div>
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onEnter?.();
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--tx)";
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--bd)";
          e.currentTarget.style.boxShadow = "none";
        }}
        style={{
          width: "100%",
          height: 38,
          border: "1px solid var(--bd)",
          borderRadius: 8,
          padding: "0 12px",
          fontSize: 14,
          outline: "none",
          background: "var(--sf)",
        }}
      />
    </div>
  );
}
