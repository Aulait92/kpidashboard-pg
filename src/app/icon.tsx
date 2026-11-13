import { ImageResponse } from "next/og";

export const contentType = "image/png";

// PWA-Icons in zwei Größen: 192 (Home-Screen) und 512 (Splash-Screen).
export function generateImageMetadata() {
  return [
    {
      id: "192",
      size: { width: 192, height: 192 },
      contentType: "image/png",
      alt: "performancegrowth",
    },
    {
      id: "512",
      size: { width: 512, height: 512 },
      contentType: "image/png",
      alt: "performancegrowth",
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
          background: "#2563EB",
        }}
      >
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
