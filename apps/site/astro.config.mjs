import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import { description, repository, socialMeta } from "./src/lib/site.ts";

const origin = process.env.SITE_URL?.trim() || undefined;
const social = socialMeta(origin);

export default defineConfig({
  site: origin,
  output: "static",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Roster",
      description,
      favicon: "/favicon.svg",
      disable404Route: true,
      defaultLocale: "root",
      locales: { root: { label: "English", lang: "en" } },
      customCss: ["./src/styles/docs.css"],
      components: {
        SiteTitle: "./src/components/DocsTitle.astro",
        PageTitle: "./src/components/DocsPageTitle.astro",
        ThemeProvider: "./src/components/ThemeProvider.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
        Head: "./src/components/DocsHead.astro",
      },
      social: [{ icon: "github", label: "GitHub", href: repository }],
      head: [
        { tag: "meta", attrs: { property: "og:image", content: social.image } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { property: "og:image:alt", content: "Roster. All your tools. One local router. Local routing, learning, and approved skills." } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
      ],
      sidebar: [
        { label: "Start here", items: [
          { label: "Meet Roster", slug: "docs/introduction" },
          { label: "Install & first run", slug: "docs/installation" },
          { label: "Set up with your agent", slug: "docs/agent-setup" },
        ] },
        { label: "Use Roster", items: [
          { label: "Clients, sync & eject", slug: "docs/clients" },
          { label: "Transparent & five mode", slug: "docs/modes" },
          { label: "Tools & the Playbook", slug: "docs/playbook" },
          { label: "Local learning", slug: "docs/learning" },
          { label: "Failures & drift", slug: "docs/failures" },
        ] },
        { label: "Understand the details", items: [
          { label: "Command reference", slug: "docs/commands" },
          { label: "Configuration", slug: "docs/configuration" },
          { label: "Privacy & local state", slug: "docs/privacy" },
          { label: "Troubleshooting", slug: "docs/troubleshooting" },
          { label: "Combine & League", slug: "docs/methodology" },
        ] },
      ],
    }),
    ...(origin ? [sitemap()] : []),
  ],
});
