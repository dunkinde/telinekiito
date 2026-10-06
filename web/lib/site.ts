// Company details shown on the website. PLACEHOLDERS: replace the phone and email with real ones (the office can
// also override them under Settings → Website). Social links: add the real profile addresses; empty ones are hidden.
export const SITE = {
  name: "TelineKiito",
  phone: "+358 40 000 0000",
  phoneHref: "tel:+358400000000",
  email: "info@telinekiito.fi",
  social: {
    linkedin: "",
    instagram: "",
    facebook: ""
  } as Record<"linkedin" | "instagram" | "facebook", string>,
  // OpenStreetMap view of the Helsinki region for the contact section.
  mapEmbed: "https://www.openstreetmap.org/export/embed.html?bbox=24.55%2C60.12%2C25.35%2C60.36&layer=mapnik",
  mapLink: "https://www.openstreetmap.org/#map=10/60.24/24.95",
  year: 2026
} as const;
