import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Staff Cordusio · Salmoiraghi & Viganò",
    short_name: "Staff Cordusio",
    description: "Turni, ferie, richieste e comunicazioni del negozio di Piazza Cordusio",
    lang: "it",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
