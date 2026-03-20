import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/* eslint-disable @next/next/no-img-element */
export default function Icon() {
  // Keep in sync with the logo used in auth/login UI: /vercel.svg
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <img
          width={64}
          height={64}
          src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100' fill='none'><circle cx='50' cy='50' r='48' fill='%231A1A1A'/><g transform='translate(15, 15)'><path d='M35 10L10 35L35 60Z' fill='%23FFFFFF'/><path d='M35 10L60 35L35 60Z' fill='%23FFFFFF'/><rect x='34' y='25' width='2' height='30' rx='1' fill='%231A1A1A'/><circle cx='35' cy='60' r='4' fill='%231A1A1A'/></g></svg>"
          alt="VerseCraft"
        />
      </div>
    ),
    { ...size }
  );
}

