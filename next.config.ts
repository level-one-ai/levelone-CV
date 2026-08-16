import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // docxtemplater and pizzip are CommonJS libraries that read from the file
  // system. Keeping them external stops the bundler from trying to inline
  // them into the server build, which breaks their internal requires.
  serverExternalPackages: ["docxtemplater", "pizzip"],
};

export default nextConfig;
