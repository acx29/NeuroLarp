"use client";
//**
// components/shell.tsx
// App shell: collapsible sidebar, nav, settings popover (theme+accent), feature card, account card
//**
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const ACCENTS: Array<[string, string]> = [
  ["Green", "#0E7C66"],
  ["Pink", "#D6336C"],
  ["Navy", "#33506B"],
];

const NAV = [
  { key: "home", label: "Home", href: "/home" },
  { key: "notes", label: "Notes", href: "/notes" },
  { key: "topics", label: "Learning Topics", href: "/topics" },
  { key: "graph", label: "Node Graph", href: "/graph" },
  { key: "progress", label: "Progress", href: "/progress" },
  { key: "quiz", label: "Quiz", href: "/quiz" },
  { key: "plans", label: "Plans", href: "/plans" },
  { key: "sources", label: "Sources", href: "/sources" },
] as const;

function NavIcon({ k, color }: { k: string; color: string }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const svg = (child: React.ReactNode) => (
    <svg width="20" height="20" viewBox="0 0 16 16" style={{ color, flex: "none" }}>
      {child}
    </svg>
  );
  switch (k) {
    case "home":
      return svg(<path d="M2.5 6.7 L8 2.2 L13.5 6.7 V13.5 H2.5 Z" style={s} />);
    case "notes":
      return svg(<path d="M4 2.5 H12 V13.5 H4 Z M6.3 6.3 H9.7 M6.3 9.3 H9.7" style={s} />);
    case "topics":
      return svg(<path d="M6.2 2.5 L4.8 13.5 M11.2 2.5 L9.8 13.5 M3.2 6 H13.2 M2.8 10 H12.8" style={s} />);
    case "graph":
      return svg(
        <>
          <circle cx="8" cy="4" r="2" style={s} />
          <circle cx="4" cy="12" r="2" style={s} />
          <circle cx="12" cy="12" r="2" style={s} />
          <path d="M7 5.7 L4.9 10.3 M9 5.7 L11.1 10.3" style={{ stroke: "currentColor", strokeWidth: 1.5 }} />
        </>
      );
    case "progress":
      return svg(<path d="M3 13.5 V9.5 M8 13.5 V5.5 M13 13.5 V2.8" style={{ ...s, strokeWidth: 1.8 }} />);
    case "quiz":
      return svg(
        <>
          <circle cx="8" cy="8" r="5.7" style={s} />
          <path d="M5.9 8.1 L7.3 9.5 L10.2 6.4" style={s} />
        </>
      );
    case "plans":
      return svg(
        <>
          <rect x="2.8" y="3.5" width="10.4" height="10" rx="1.5" style={s} />
          <path d="M2.8 6.8 H13.2 M5.6 2.2 V4 M10.4 2.2 V4" style={s} />
        </>
      );
    case "sources":
      return svg(
        <path
          d="M12.8 13.5 H5.2 A2 2 0 0 1 3.2 11.5 V4.5 A2 2 0 0 1 5.2 2.5 H12.8 V11 H5.2 A1.25 1.25 0 0 0 3.95 12.25"
          style={s}
        />
      );
    default:
      return null;
  }
}

export function Shell(props: {
  userId: string;
  username: string;
  email: string;
  settings: Record<string, unknown>;
  dueCount: number;
  featureCard: { planId: string; name: string; done: number; total: number; daysLeft: number } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [dark, setDark] = useState<boolean>(() => !!props.settings.dark);
  const [accent, setAccent] = useState<string>(() => (props.settings.accent as string) ?? "#0E7C66");
  const [featShow, setFeatShow] = useState(true);
  const settingsRef = useRef<Record<string, unknown>>(props.settings);

  // Apply + persist appearance (localStorage mirror for no-flash; profiles.settings for durability)
  const persist = useCallback((next: { dark?: boolean; accent?: string; dismissedPlanCard?: string }) => {
    const merged = { ...settingsRef.current, ...next };
    settingsRef.current = merged;
    document.documentElement.classList.toggle("nl-dark", !!merged.dark);
    document.documentElement.style.setProperty("--nl-accent", (merged.accent as string) ?? "#0E7C66");
    localStorage.setItem("nl-appearance", JSON.stringify({ dark: merged.dark, accent: merged.accent }));
    supabaseBrowser()
      .from("profiles")
      .update({ settings: merged as never })
      .eq("id", props.userId)
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // server settings win on first load (cross-device durability)
    document.documentElement.classList.toggle("nl-dark", dark);
    document.documentElement.style.setProperty("--nl-accent", accent);
    localStorage.setItem("nl-appearance", JSON.stringify({ dark, accent }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = (d: boolean) => {
    setDark(d);
    persist({ dark: d });
  };
  const pickAccent = (c: string) => {
    setAccent(c);
    persist({ accent: c });
  };
  const dismissFeat = () => {
    setFeatShow(false);
    if (props.featureCard) persist({ dismissedPlanCard: props.featureCard.planId });
  };
  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/");
    router.refresh();
  };

  const navPadX = open ? 8 : 12;
  const fc = props.featureCard;
  const pct = fc && fc.total > 0 ? Math.round((fc.done / fc.total) * 100) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: "var(--sf)" }}>
      <div
        style={{
          width: open ? 280 : 68,
          transition: "width .18s ease",
          flex: "none",
          display: "flex",
          flexDirection: "column",
          background: "var(--sf)",
          borderRight: "1px solid var(--bd)",
          padding: open ? "20px 16px 16px" : "20px 12px 16px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: open ? "flex-start" : "center",
            padding: "0 2px 16px 2px",
            minHeight: 44,
          }}
        >
          {open && (
            <div
              className="nl-wordmark"
              style={{ paddingLeft: 2, fontSize: 22, color: "var(--tx)", whiteSpace: "nowrap" }}
            >
              neurolarp.
            </div>
          )}
          {open && <span style={{ flex: 1 }} />}
          <div
            onClick={() => setOpen(!open)}
            title="Toggle sidebar"
            className="hv-sf3 hv-tx"
            style={{
              width: 28,
              height: 28,
              flex: "none",
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--tx3)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)", transition: "transform .18s ease" }}
            >
              <path
                d="M9.8 3.8 L5.6 8 L9.8 12.2"
                style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}
              />
            </svg>
          </div>
        </div>

        {open && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: "0 10px",
              marginBottom: 16,
              border: "1px solid var(--bd)",
              borderRadius: 8,
              boxShadow: "0 1px 2px rgba(10,13,18,0.05)",
              background: "var(--sf)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" style={{ color: "var(--tx3)", flex: "none" }}>
              <circle cx="7" cy="7" r="4.4" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.5 }} />
              <path d="M10.4 10.4 L13.6 13.6" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }} />
            </svg>
            <input
              placeholder="Search"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const q = (e.target as HTMLInputElement).value.trim();
                  if (q) router.push(`/notes?q=${encodeURIComponent(q)}`);
                }
              }}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 14, color: "var(--tx)", background: "transparent" }}
            />
            <span style={{ flex: "none", padding: "1px 5px", border: "1px solid var(--bd)", borderRadius: 4, fontSize: 11, color: "var(--tx3)" }}>
              ⌘K
            </span>
          </div>
        )}

        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.key} href={item.href} prefetch={true}>
              <div
                className={active ? "" : "hv-sf2"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 36,
                  padding: `0 ${navPadX}px`,
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 2,
                  background: active ? "var(--sf3)" : "transparent",
                  color: active ? "var(--tx)" : "var(--tx2)",
                  justifyContent: open ? "flex-start" : "center",
                }}
              >
                <NavIcon k={item.key} color={active ? "var(--tx3)" : "var(--tx4)"} />
                {open && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
                {open && item.key === "quiz" && props.dueCount > 0 && (
                  <>
                    <span style={{ flex: 1 }} />
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                        borderRadius: 999,
                        border: "1px solid var(--bd)",
                        background: "var(--sf2)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--tx2)",
                        flex: "none",
                      }}
                    >
                      {props.dueCount}
                    </span>
                  </>
                )}
              </div>
            </Link>
          );
        })}

        <div style={{ flex: 1 }} />

        <div style={{ position: "relative" }}>
          <div
            onClick={() => (open ? setSettingsOpen(!settingsOpen) : (setOpen(true), setSettingsOpen(true)))}
            className="hv-sf2"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: `0 ${navPadX}px`,
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--tx2)",
              cursor: "pointer",
              marginBottom: 2,
              background: settingsOpen && open ? "var(--sf3)" : "transparent",
              justifyContent: open ? "flex-start" : "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 16 16" style={{ color: "var(--tx4)", flex: "none" }}>
              <circle cx="8" cy="8" r="2.1" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.4 }} />
              <path
                d="M8 1.9 V3.5 M8 12.5 V14.1 M1.9 8 H3.5 M12.5 8 H14.1 M3.7 3.7 L4.85 4.85 M11.15 11.15 L12.3 12.3 M12.3 3.7 L11.15 4.85 M4.85 11.15 L3.7 12.3"
                style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" }}
              />
            </svg>
            {open && <span style={{ whiteSpace: "nowrap" }}>Settings</span>}
          </div>
          {settingsOpen && open && (
            <div
              style={{
                position: "absolute",
                bottom: 42,
                left: 0,
                width: 216,
                background: "var(--sf)",
                border: "1px solid var(--bd)",
                borderRadius: 10,
                boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
                padding: 6,
                zIndex: 40,
                animation: "nl-pop .15s ease",
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "6px 8px 8px" }}>
                APPEARANCE
              </div>
              <div style={{ display: "flex", background: "var(--sf3)", borderRadius: 8, padding: 2, margin: "0 6px 6px" }}>
                <button
                  onClick={() => setTheme(false)}
                  style={{
                    flex: 1,
                    height: 26,
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 550,
                    cursor: "pointer",
                    background: !dark ? "var(--segOn)" : "transparent",
                    color: !dark ? "var(--tx)" : "var(--tx3)",
                  }}
                >
                  Light
                </button>
                <button
                  onClick={() => setTheme(true)}
                  style={{
                    flex: 1,
                    height: 26,
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 550,
                    cursor: "pointer",
                    background: dark ? "var(--segOn)" : "transparent",
                    color: dark ? "var(--tx)" : "var(--tx3)",
                  }}
                >
                  Dark
                </button>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "8px 8px 8px" }}>
                ACCENT
              </div>
              <div style={{ display: "flex", gap: 10, padding: "0 8px 8px" }}>
                {ACCENTS.map(([name, c]) => (
                  <span
                    key={c}
                    onClick={() => pickAccent(c)}
                    title={name}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: c,
                      cursor: "pointer",
                      border: "2px solid var(--sf)",
                      boxShadow: accent === c ? "0 0 0 1.5px var(--tx)" : "0 0 0 1px var(--bd)",
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {open && featShow && fc && (
          <div style={{ margin: "12px 0", background: "var(--sf2)", borderRadius: 12, padding: 16, position: "relative" }}>
            <span
              onClick={dismissFeat}
              className="hv-tx"
              style={{ position: "absolute", top: 10, right: 11, color: "var(--tx4)", fontSize: 12, cursor: "pointer", lineHeight: 1 }}
            >
              ✕
            </span>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx)" }}>{fc.name}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--tx3)", margin: "4px 0 16px" }}>
              {fc.done} of {fc.total} sessions done.{fc.daysLeft > 0 ? ` Exam in ${fc.daysLeft} days. On track.` : ""}
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--bd)", marginBottom: 16 }}>
              <div style={{ height: 8, width: `${pct}%`, borderRadius: 999, background: "var(--nl-accent)" }} />
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 14, fontWeight: 600 }}>
              <span onClick={dismissFeat} className="hv-tx" style={{ color: "var(--tx3)", cursor: "pointer" }}>
                Dismiss
              </span>
              <span onClick={() => router.push("/plans")} className="hv-op8" style={{ color: "var(--nl-accent)", cursor: "pointer" }}>
                View plan
              </span>
            </div>
          </div>
        )}

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: open ? "1px solid var(--bd)" : "none",
            borderRadius: 12,
            padding: open ? 12 : 2,
            marginTop: open && featShow && fc ? 0 : 12,
          }}
        >
          <div style={{ position: "relative", flex: "none" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--inv)",
                color: "var(--invTx)",
                display: "grid",
                placeItems: "center",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              {props.username.charAt(0).toUpperCase()}
            </div>
            <span
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#17B26A",
                border: "1.5px solid #fff",
              }}
            />
          </div>
          {open && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {props.username}
              </div>
              <div style={{ fontSize: 13, color: "var(--tx3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {props.email}
              </div>
            </div>
          )}
          {open && (
            <div
              onClick={() => setAcctOpen(!acctOpen)}
              className="hv-sf2"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 26,
                height: 26,
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--tx4)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16">
                <path
                  d="M5.5 6.3 L8 3.8 L10.5 6.3 M5.5 9.7 L8 12.2 L10.5 9.7"
                  style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}
                />
              </svg>
            </div>
          )}
          {acctOpen && open && (
            <div
              style={{
                position: "absolute",
                bottom: 64,
                right: 0,
                width: 160,
                background: "var(--sf)",
                border: "1px solid var(--bd)",
                borderRadius: 10,
                boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
                padding: 6,
                zIndex: 40,
                animation: "nl-pop .15s ease",
              }}
            >
              <Link href="/settings">
                <div className="hv-sf2" style={{ padding: "8px 10px", borderRadius: 7, fontSize: 13, fontWeight: 550, cursor: "pointer", color: "var(--tx2)" }}>
                  Account settings
                </div>
              </Link>
              <div
                onClick={signOut}
                className="hv-sf2"
                style={{ padding: "8px 10px", borderRadius: 7, fontSize: 13, fontWeight: 550, cursor: "pointer", color: "var(--tx2)" }}
              >
                Sign out
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
        {props.children}
      </div>
    </div>
  );
}
