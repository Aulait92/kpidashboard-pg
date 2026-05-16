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
          background:
            "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          color: "#ffffff",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 800,
          fontSize: 92,
          letterSpacing: -3,
        }}
      >
        kpi
      </div>
    ),
    size,
  );
}
