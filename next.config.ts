//**
// next.config.ts
// devIndicators off: hides the floating dev-tools button during `next dev`.
// Compile and runtime errors still overlay; production builds never show it.
//**
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
