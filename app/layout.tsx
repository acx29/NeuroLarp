//**
// app/layout.tsx
// Root layout: fonts (Mona Sans + Fraunces w/ SOFT+WONK axes), theme-init before paint
//**
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "neurolarp",
  description: "Notes in. Mental map out.",
};

// Applies stored theme + accent before first paint — no flash (PLAN: App shell).
const themeInit = `(function(){try{var s=JSON.parse(localStorage.getItem("nl-appearance")||"{}");if(s.dark)document.documentElement.classList.add("nl-dark");if(s.accent)document.documentElement.style.setProperty("--nl-accent",s.accent);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Mona+Sans:ital,wght@0,200..900;1,200..900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,100..900,0,1&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
