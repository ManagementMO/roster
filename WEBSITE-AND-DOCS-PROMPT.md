You are working on Roster at ~/Downloads/roster. Build its public-facing launch website and documentation as a finished, cohesive product experience.

This is an implementation request. Understand the project, make thoughtful design decisions, build the website, run it, inspect it in a real browser, and keep polishing until the result is ready for review. Do not stop at a plan, scaffold, mood board, or list of suggestions.

1. The experience I want

I want a beautiful developer-product website: memorable, clear, clean, confident, and pleasant to use. It should look like a small team with excellent design judgment made every decision deliberately.

Roster can be colorful, vibrant, saturated, tactile, glassy, and glossy where those choices help. Restrained gradients, translucent surfaces, dimensional artwork, and purposeful motion are explicitly welcome. Build a coherent visual language around the product.

My priorities are:
- A strong, recognizable logo and wordmark.
- Excellent typography and spacing.
- One especially good product demonstration.
- A short landing page that explains the product quickly.
- Documentation that feels as considered as the homepage.
- Consistency across navigation, icons, controls, themes, code examples, and sharing assets.
- Real functionality, readable content, and low maintenance.

Make the product's mechanism interesting to look at. Avoid decoration that could belong to any AI startup.

2. Research before design, and reconcile the repository baseline

Read AGENTS.md and applicable directory instructions first. Inspect Git status, branch, and HEAD before edits. Preserve existing work, including the film projects and root package changes.

There is a known version mismatch you must recheck. During the preceding research session, the local checkout was at f50e873d92e062e976ffeab8173ca3d2ffefc078, while public main at https://github.com/ManagementMO/roster was at 670c77e0c6d1ada1d1569363d88d3b0380b762e8. Public main contains substantial later fixes and updated product/release wording. Those hashes are orientation, not permission to assume either is still current.

Compare the current local and public states without overwriting the working tree. If an up-to-date baseline needs a separate worktree or checkout, create one cleanly and preserve the local creative assets. State which product revision the website describes. Do not silently pull over changes, reset, rebase, or mix incompatible versions.

Read the relevant current versions of:
- README.md
- ROSTER-STATE-AND-DECISIONS.md, especially its binding decisions
- ROSTER-BUILD-HANDOFF.md, the build contract
- STATUS-FOR-MO.md, including what remains planned or owner-gated
- ROSTER.md for product vocabulary and strategy; treat its old market research and launch dates as historical
- docs/methodology.md, docs/telemetry-schema.md, and docs/PROVENANCE.md
- Representative current evidence under docs/verification/ and docs/lab/

Trace actual behavior through:
- packages/cli: bin, init, clients, receipt, sync, eject, entry, serve, dense, telemetry, and configuration paths
- packages/router: rosterServer, backends, and capability cards
- packages/coach: outcome storage, classification, retrieval, ratings, and maintenance
- packages/playbook: discovery, trust checks, and skill invocation
- packages/combine and apps/league: artifact validation, certification, and ranking eligibility

Read representative tests as well as implementation. Identify what is implemented, what has meaningful verification, and what is only planned. A website assignment is not a reason to implement the entire product roadmap.

Keep a compact internal claim-to-source map for the important public claims. Use current official documentation for framework or library decisions, including Context7 when available. Verify external comparisons before repeating them; it is better to omit a shaky comparison than build the hero around it.

3. What Roster actually does

Roster routes tools and skills for AI agents. It does not route between AI models.

Its useful story is that a large collection of capabilities can behave like a small, task-specific team:
- The Rotation is the local MCP router.
- The Coach uses derived call outcomes to improve local routing.
- The Playbook brings approved skill instructions into the capability index.
- The Combine runs reproducible task suites.
- The League presents eligible results under explicit methodology.

The memorable existing hook is:
“Your agent has 200 tools. Only five get to start.”

You may refine the headline if you find something clearer, but preserve the idea. The 200 is illustrative, not an observed visitor inventory. Five mode returns up to five candidates by default, with K configurable from 1 to 10.

These boundaries matter:
- Transparent passthrough is the default. Five mode is explicitly enabled.
- In five mode, the agent sees the stable draft and call tools. A draft returns compact tool or skill cards; the agent chooses what to invoke.
- Selecting tools is different from solving the user's whole task. A returned result must not become an invented “bug fixed” or “task verified” claim.
- The Sixth Man suggests an alternate after qualifying failures. Roster does not automatically execute that alternate.
- Invoking a skill returns instructions and resources. Roster does not execute its bundled scripts for the agent.
- Local learning uses derived outcomes and maintenance. It is not immediate model retraining after every call.
- Lexical retrieval works without a model download. In the newer public implementation, dense retrieval is opt-in. Verify its current setup before documenting it.
- The current routing boundary is command-backed stdio MCP servers. Separate general protocol compatibility, config discovery, config write support, and actual tested integrations.
- The four explicit sync/eject write clients in the inspected implementation are Claude Code, Cursor, Codex, and OpenClaw. Wider discovery does not mean all clients receive the same write support.
- Eject is a valuable trust feature: dedicated config files restore byte-for-byte, while supported live-state files use key-level restoration that preserves subsequent user changes. Explain the real behavior rather than promising universal magic undo.
- Roster keeps its routing state locally. Backend tools may still contact their normal services. Do not imply Roster makes every downstream API call offline or prevents data being sent by a tool the user invokes.
- Telemetry defaults off. The inspected implementation has a consent setting but no upload endpoint.
- Public named League ranks require the appropriate authoritative human-signed evidence. Unsigned pre-season artifacts are not certified rankings.

Use these facts to write simple copy. Put detailed qualifications in the appropriate guide, with only the brief context needed on the landing page.

4. Transfer the right lessons from Agent2Learn

You may inspect ~/Downloads/agent2learn/frontend as a read-only quality reference.

What I loved there:
- A clear headline and a restrained number of sections.
- A substantial interactive product example that explained the actual mechanism.
- An interaction that connected an action to evidence: selecting a citation revealed its source.
- Readable text inside the product example, including on mobile.
- Calm documentation with good navigation and comfortable line lengths.
- A proper logo and distinct, consistent icons.
- Light and dark modes that felt like one product.
- A copyable installation path and a useful setup prompt for agents.
- Direct, natural product copy.

For Roster, transfer those principles. Give it its own composition, personality, palette, and signature interaction. Do not turn its homepage into another course-vault/file-browser demonstration.

One explicit preference: do not add View Markdown, Copy page, generated Markdown twins of the website docs, or a combined full-docs export. I removed that layer from Agent2Learn because it was unnecessary maintenance. Ordinary Markdown/MDX source files for authoring docs are fine. Copy buttons for commands and the dedicated agent setup prompt are useful and should stay.

5. Brand and visual direction

Inspect the existing Roster assets before inventing a new identity. In particular:
- videos/roster-premiere-tight/BRIEF.md
- videos/roster-premiere-tight/PRODUCT-RESEARCH.md
- videos/roster-premiere-tight/ASSET-SOURCES.md
- videos/roster-premiere-tight/assets/roster-logo.png
- The latest relevant frames and finished assets from that production

The current mark is the clean angular two-part white Roster symbol. There are older marks in earlier experiments; do not choose an obsolete asset just because it is easy to find.

Start by seeing whether the current mark can become an excellent website identity through better sizing, clear space, theme variants, a careful wordmark, and appropriate export formats. Improve the identity when justified, but do not replace it merely for novelty. The result must work at favicon size, in the header, in docs, and on a sharing image. Preserve the mark's proportions.

A promising direction is pearl or pale cool surfaces, deep ink/navy, a confident cobalt or similarly coherent primary accent, and vivid capability or vendor icons. The existing film's Space Grotesk, Manrope, and JetBrains Mono are useful candidates. This is a starting point, not a fixed palette or compulsory font stack. Choose what produces the strongest coherent website.

Give every color a job:
- Brand color establishes identity and the main action.
- Tool and vendor colors help capabilities stay recognizable.
- Semantic colors communicate outcomes and states.
- Neutral surfaces make reading comfortable.

Native vendor marks should retain their recognizable colors and proportions. Do not apply a global monochrome filter or color wash to the ecosystem.

Glass and gloss should feel like carefully chosen materials: a crisp edge, subtle reflection, shallow depth, a selected translucent panel. Keep text-bearing surfaces legible. Avoid making every card blurry, reflective, or embossed. Small functional icons should remain crisp and modern even if a hero object has more dimension.

Create one coherent icon family for original product illustrations. Match optical weight and construction. Avoid random mixtures of emoji, generic file icons, unrelated outline sets, and generated clip art.

Use available image tools if they materially improve an original brand or hero asset. Prefer editable SVG/CSS for interface geometry and precise type. Keep provenance and licenses with assets. Do not add paid purchases or external services without authorization.

6. The signature product demonstration

Make the homepage's centerpiece a beautiful, fully interactive “starting five” demonstration.

A strong causal sequence is:
A task is chosen → a small lineup is drafted → a capability is selected → its example call/result is shown → a derived outcome is recorded locally.

Use two or three well-chosen task presets so changing the task visibly changes the lineup. Possible subjects include inspecting a checkout page, finding relevant code, or reading project instructions. Choose examples you can support with coherent fixtures and actual Roster semantics.

Requirements:
- Show recognizable capability names, a short useful description, and a consistent icon.
- Tools and skills may appear together; explain their different invocation behavior in context.
- Make selection reveal meaningful detail, not just a decorative active border.
- A skill selection should reveal instructions/resources, not fake automatic script execution.
- Make the sequence understandable without reading raw JSON. A compact optional technical detail view may show accurate draft/call shapes.
- Use real fixture-derived output where practical. Otherwise label the workflow clearly and quietly as illustrative.
- Do not present illustrative vendors as certified League winners, endorsements, or a measured compatibility matrix.
- Keep state transitions stable. Cards, panels, and source details should not jump around as content changes.
- Support keyboard interaction and narrow screens. Preserve readable type rather than shrinking a desktop dashboard to fit.
- If an input looks like it accepts arbitrary tasks, it must have an honest working behavior. Curated presets are preferable to a fake chat box.
- Do not call a visitor's tools, access their local configs, require an API key, or create a hosted agent service for this marketing demo.
- If you show a failure variant, make the alternate a suggestion the agent can choose. Do not show an automatic rescue.

Give this demonstration most of the creative attention. The surrounding page should help people understand it.

7. Landing-page composition

Keep the page short and purposeful. Aim for roughly four or five substantial sections, adjusting to the actual content.

The opening should establish:
- What Roster is.
- Who it helps.
- Why a small task-specific lineup is useful.
- The next practical step.
- Current release status.

Use one primary CTA and one secondary path. Avoid a row of competing buttons. Put the installation or getting-started path where it is easy to find.

A useful structure is:
- A strong hero and the starting-five demonstration.
- A compact explanation of the everyday value: one local entry point, task-specific capabilities, and learning from outcomes.
- A clear setup path, including the agent handoff and reversible config story.
- A small open-source/trust section and a restrained footer.

Fit the Playbook and Coach into this story rather than creating a long card grid for every internal package. The sports vocabulary should add character while ordinary language does the explaining. A visitor should not need a glossary before understanding the product.

The existing launch film can be used as an optional click-to-play asset if it improves the page. Inspect the actual current cut and claims first. Use a web-appropriate encode and poster; do not eagerly load a huge master or autoplay audio. Making a new film is not required for this task.

Do not add fake testimonials, customer counts, logos presented as endorsements, pricing tiers, fabricated savings graphs, a nonfunctional waitlist, or a wall of roadmap promises.

8. Professional, low-maintenance documentation

Build a proper documentation experience, preferably using an established docs system that fits the chosen website stack. Do not hand-roll search, complex focus behavior, or a navigation framework when a maintained solution already handles it well.

Choose a compact information architecture around user questions. A reasonable starting set is:
- Introduction and how Roster works
- Installation and first run
- Client setup, sync, and eject
- Transparent mode and five mode
- Tools and the Playbook
- Local learning and optional dense retrieval
- Failures, Sixth Man suggestions, and drift quarantine
- Command and configuration reference
- Privacy and local state
- Troubleshooting
- Combine, League, and methodology

Combine pages when that improves navigation. Give each guide one job and a helpful next step.

Use:
- Comfortable body text around 16px, good line height, and a reading column around 65–75 characters.
- A clear sidebar, active navigation, breadcrumbs where useful, and a quiet on-page table of contents.
- Search that works in the built site.
- Accurate command examples with copy feedback and a usable failure fallback.
- Short inline commands kept together where possible without changing the characters users copy.
- Horizontal scrolling inside long code blocks rather than across the whole page.
- Consistent code styling, links, callouts, and light/dark themes.
- Brief examples before deeper explanations.
- Clear version/release information where it affects an action.

Keep one authored source for each website guide. Reuse or link authoritative methodology/privacy documents where sensible rather than creating drifting copies. Centralize shared package names, install commands, release state, repository URLs, and the setup prompt.

No duplicate website-docs Markdown export layer. A small automatically generated index linking to ordinary docs pages is acceptable only if it is useful and stays simple.

9. Installation and the agent handoff

At the inspected public revision, the selected npm package is @roster/cli and the executable is roster. The package was still unpublished. The unscoped npm package roster belongs to an unrelated system-user-account utility: never point visitors or agents at npx roster.

Recheck the registry and current release metadata before writing installation instructions. Do not repeat the old July 28 launch date or invent a replacement date.

Provide an honest pre-release experience now and a simple transition after publication. Keep the actual package name, publication state, and command examples in one small shared module.

When unpublished, clearly label the future npm path and provide the appropriate repository/source-install guide. Avoid a primary button that silently leads to an unavailable package. Do not simulate a package release.

Check the entire command sequence. Running npx -y @roster/cli init does not, by itself, make a global roster command available afterward. Use a consistent execution strategy or a documented global installation path. Verify commands against the current CLI; do not invent familiar flags such as --version without checking they exist.

Create a concise, copyable “Set up with your agent” prompt and a related docs page. It should help a coding agent:
- Understand what Roster is and identify an existing installation.
- Check release availability and use the correct package.
- Explain the supported target clients and the intended config changes.
- Respect the user's authorized scope and preserve existing configuration/backups.
- Present lexical operation and optional dense retrieval accurately.
- Explain how sync, serve mode, and eject fit together.
- Keep credentials and raw client configuration out of chat or logs.
- Avoid forced restoration, trust overrides, telemetry opt-in, or unrelated client changes as silent setup defaults.

Adapt this handoff to Roster's real workflow. Do not copy Agent2Learn's sign-in instructions or its CLI assumptions.

10. League scope and truthful public claims

The newer status record says the public League website is deferred. Building this landing page and docs does not authorize completing or publishing the League, certifying tasks, or launching a telemetry service.

Explain the League and Combine in the docs and, if useful, a brief homepage section. Link to an actual explanatory page rather than a dead future URL.

If you include a local pre-season preview, preserve the existing artifact validation and certification rules from apps/league. Do not fork ranking logic into a decorative frontend data file. Do not invent named ranks, badges, scores, win rates, signed tasks, or live traffic.

Do not market these planned features as shipped unless the current implementation and evidence now support them:
- A flight-recorder dashboard
- Automatic Sixth Man execution
- Universal HTTP backend support
- Public-Lab prior seeding
- Automatic context-threshold engagement
- Public live telemetry standings
- Receipt percentiles, roast, Wrapped, or bench commands
- One-click configuration writers for every client

Keep the public prose clear and positive. Accurate scope can be communicated with short, well-placed notes; it does not require covering the homepage in warnings.

11. Engineering and folder boundaries

Use a clean, separate website workspace, preferably apps/site, because Roster already uses a pnpm monorepo with an apps tier. If a suitable website workspace now exists, improve it instead of creating a competing one.

Keep website source, public assets, docs content, and its development README easy to find. Use the existing package manager and workspace conventions. Avoid adding another competing lockfile at the repository root.

Choose a small, maintainable stack. Static output is preferred for this launch site and docs. Add client JavaScript for the interactions that need it. Keep the existing TypeScript product packages independent of the website build.

Preserve:
- Existing product behavior and configuration lifecycle
- League certification/ranking logic
- Existing film projects and creative assets
- Unrelated worktree changes
- Security and release gates

Use reusable design tokens for colors, typography, spacing, radii, borders, depth, and motion. Share them across the landing page and docs. Keep content models and components straightforward; do not build a general-purpose page builder or bespoke docs compiler.

Optimize fonts and images. Prefer local assets with licenses. Keep tiny logos tiny in transfer size. Use consistent asset paths and avoid runtime font/CDN dependencies unless there is a justified need.

12. Interaction, accessibility, and motion

Light and dark modes should both look intentionally designed. Start from system preference, provide a clear switch, remember the choice, and keep it consistent across landing and docs without a theme flash.

Use motion to explain the draft, selection, and result. Keep ordinary UI feedback quick. Avoid endless idle animation, floating particles, decorative orbiting widgets, scroll hijacking, custom cursors, or excessive entrance effects.

Favor transform and opacity. Do not animate large blur surfaces or make scrolling depend on expensive effects. Respect reduced motion, pause off-screen loops if any are justified, and preserve the full meaning in a static state.

Use native semantics or established accessible primitives. Check focus visibility, keyboard operation, labels, touch targets, dialogs, menus, and copy feedback. Test readable contrast on the actual glass/background combinations.

Clean means strong hierarchy and readable content. It does not mean tiny gray text or removing useful navigation.

13. Launch assets and finishing details

Deliver:
- The finished responsive landing page.
- The complete, usable documentation experience.
- The interactive product demonstration.
- The correct installation/release presentation.
- The dedicated agent setup prompt.
- A coherent logo/wordmark treatment and favicon.
- A polished 1200 × 630 social preview with the real identity and a truthful product illustration.
- Page titles, descriptions, canonical/social metadata, a sitemap when a real site origin is configured, and a useful 404.
- A concise developer README explaining local run/build, content locations, release switching, and static deployment preparation.

Do not invent or register a production domain. Make deployment configuration straightforward once the owner chooses one. Complete the local artifact without publishing the site, package, or release.

14. How to work and what counts as done

After research, briefly state the product thesis, visual direction, signature interaction, and implementation approach. Choose a strong direction and proceed. Do not ask me to approve every color, font, spacing choice, or reversible local change.

Build in sensible stages and inspect real screenshots during the work. Compare desktop and mobile. Critique the result against this brief, correct awkward composition and readability, and make at least one deliberate polish pass.

Verify the affected boundary with:
- The website's production build, type checks, and relevant linting.
- Internal routes, links, anchors, assets, and release-state behavior.
- Desktop, tablet, and narrow phone widths, including approximately 320–390px.
- Both themes and reduced motion.
- The demo's state transitions and keyboard interaction.
- Docs navigation, search, code-copy controls, and the agent prompt.
- No horizontal page overflow, broken images, obvious console errors, or avoidable layout shifts.
- Appropriate accessibility checks plus visual inspection.
- The repository checks required by the actual code changes.

Use temporary fixtures for any CLI demonstrations. Do not run init, sync, eject, or backend tools against my personal configuration merely to obtain a screenshot. Do not fetch embedding models or run paid services for a marketing demonstration.

Distinguish a successful local build and browser check from a deployed site, published package, live integration proof, or certified League score.

When finished, give me the preview URL, show the important visual results, identify where the source lives, summarize what was verified, and name any real remaining external launch step. Do not end with “I can build this next.”

The finished result should make Roster understandable, recognizable, and worth trying within a few seconds, then make the next ten minutes of reading and setup feel easy. Aim for something distinctive and beautifully resolved, with enough restraint that the product stays the focus.
