import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lumora - Secure E2EE Cloud Drive",
    short_name: "Lumora",
    description: "Secure, E2E encrypted cloud storage drive with smart AI search.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0a09", // Stone-950 theme matching Lumora UI
    theme_color: "#0c0a09",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
