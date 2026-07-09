import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fix turbopack root detection (multiple lockfiles in parent dirs)
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Output standalone for Docker deployment
  output: "standalone",
};

export default nextConfig;
