import { ImageResponse } from "next/og";

// iOS verlangt eine 180x180-PNG ohne Transparenz für den Home-Screen.
// Wird via <link rel="apple-touch-icon"> automatisch eingebunden.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563EB",
        }}
      >
        <svg width={108} height={108} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </div>
    ),
    size,
  );
}
