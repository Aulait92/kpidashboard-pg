import { ImageResponse } from "next/og";

export const contentType = "image/png";

// PWA-Icons in zwei Größen: 192 (Home-Screen) und 512 (Splash-Screen).
export function generateImageMetadata() {
  return [
    {
      id: "192",
      size: { width: 192, height: 192 },
      contentType: "image/png",
      alt: "KPI-Dashboard",
    },
    {
      id: "512",
      size: { width: 512, height: 512 },
      contentType: "image/png",
      alt: "KPI-Dashboard",
    },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const iconId = await id;
  const size = iconId === "512" ? 512 : 192;

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
          fontSize: size * 0.5,
          letterSpacing: -size * 0.03,
        }}
      >
        kpi
      </div>
    ),
    { width: size, height: size },
  );
}
