"use client";
//**
// components/settings-view.tsx
// Settings screen: account card, monthly AI usage meter, BYOK section
// (provider segmented control, key verify + save, masked hint, model picker)
//**
import { useState } from "react";
import { useRouter } from "next/navigation";

const MODELS: Record<string, Array<{ id: string; label: string }>> = {
  openai: [
    { id: "gpt-5-mini", label: "GPT-5 mini (default)" },
    { id: "gpt-5-nano", label: "GPT-5 nano (cheapest)" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  ],
};

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--bd2)", borderRadius: 10, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

export function SettingsView(props: {
  username: string;
  email: string;
  spentUsd: number;
  capUsd: number;
  byokAllowed: boolean;
  byokKey: { provider: string; hint: string; model: string } | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState(props.byokKey?.provider ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(props.byokKey?.model ?? "gpt-5-mini");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const pct = Math.min(100, Math.round((props.spentUsd / props.capUsd) * 100));

  const saveKey = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: apiKey, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      setApiKey("");
      setMsg({ kind: "ok", text: "Key verified and saved. Your calls now bill to your provider account." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "save failed" });
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    setMsg(null);
    await fetch("/api/settings/byok", { method: "DELETE" });
    setMsg({ kind: "ok", text: "Key removed. Calls use the app's metered account again." });
    setBusy(false);
    router.refresh();
  };

  return (
    <>
      <div style={{ height: 52, flex: "none", display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid var(--bd2)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Account settings</span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "36px 32px 80px" }}>
          <Section title="Account">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
              <div style={{ display: "flex" }}>
                <span style={{ width: 110, color: "var(--tx4)", fontSize: 12.5 }}>Username</span>
                {props.username}
              </div>
              <div style={{ display: "flex" }}>
                <span style={{ width: 110, color: "var(--tx4)", fontSize: 12.5 }}>Email</span>
                {props.email}
              </div>
            </div>
          </Section>

          <Section title="AI usage this month">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 650 }}>${props.spentUsd.toFixed(2)}</span>
              <span style={{ fontSize: 12.5, color: "var(--tx4)" }}>of ${props.capUsd.toFixed(2)} included</span>
            </div>
            <div style={{ height: 6, background: "var(--sf3)", borderRadius: 3, marginBottom: 10 }}>
              <div style={{ height: 6, width: `${pct}%`, background: pct >= 90 ? "#DC2626" : "var(--nl-accent)", borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--tx4)", lineHeight: 1.5 }}>
              Covers note analysis, quizzes, grading, plans, and embeddings.
              {props.byokKey ? " Calls made with your own key are not counted here." : " Add your own API key below to lift the cap."}
            </div>
          </Section>

          {props.byokAllowed && (
            <Section title="Your API key">
              {props.byokKey && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--bd2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 550 }}>
                    {props.byokKey.provider === "openai" ? "OpenAI" : "Anthropic"} key ending in {props.byokKey.hint}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--tx4)" }}>· {props.byokKey.model}</span>
                  <div style={{ flex: 1 }} />
                  <span onClick={removeKey} className="hv-tx" style={{ fontSize: 12.5, color: "var(--tx4)", cursor: "pointer" }}>
                    Remove
                  </span>
                </div>
              )}
              <div style={{ display: "flex", background: "var(--sf3)", borderRadius: 8, padding: 2, marginBottom: 12, width: 220 }}>
                {(
                  [
                    ["openai", "OpenAI"],
                    ["anthropic", "Anthropic"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => {
                      setProvider(k);
                      setModel(MODELS[k][0].id);
                    }}
                    style={{
                      flex: 1,
                      height: 26,
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12.5,
                      fontWeight: 550,
                      cursor: "pointer",
                      background: provider === k ? "var(--segOn)" : "transparent",
                      color: provider === k ? "var(--tx)" : "var(--tx3)",
                      boxShadow: provider === k ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="password"
                placeholder={provider === "openai" ? "sk-…" : "sk-ant-…"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                style={{ width: "100%", height: 36, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 12px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none", marginBottom: 12 }}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{ flex: 1, height: 36, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 8px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none" }}
                >
                  {MODELS[provider].map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={saveKey}
                  disabled={busy || !apiKey.trim()}
                  className="hv-op"
                  style={{ height: 34, padding: "0 16px", borderRadius: 8, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy || !apiKey.trim() ? 0.6 : 1 }}
                >
                  {busy ? "Verifying…" : "Verify & save"}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "var(--tx4)", lineHeight: 1.5 }}>
                The key is checked against the provider, encrypted at rest, and only its last 4 characters are ever shown again. Embeddings always use text-embedding-3-small
                {provider === "anthropic" ? ", billed to the app since Anthropic has no embedding API." : ", billed to your key."}
              </div>
              {msg && (
                <div style={{ fontSize: 12.5, color: msg.kind === "ok" ? "#10B981" : "#DC2626", marginTop: 10 }}>{msg.text}</div>
              )}
            </Section>
          )}

          {props.isAdmin && (
            <Section title="Admin">
              <div style={{ fontSize: 12.5, color: "var(--tx4)", lineHeight: 1.6 }}>
                Re-embedding after an embedding-model change runs from scripts/db-migrate.mjs tooling, not from this page. The global daily spend ceiling and admin
                email list live in environment variables.
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
