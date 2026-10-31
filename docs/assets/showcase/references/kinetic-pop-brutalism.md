---
name: kinetic-pop-brutalism
description: Apply the Kinetic Pop Brutalism (KPB) visual design system to frontend interfaces, dashboards, comic-panel layouts, posters, presentations, and reusable UI components. Use when the user requests KPB styling, neo-brutalist pastel pop aesthetics, comic-inspired layouts, or consistent visual design across deliverables.
---

# Kinetic Pop Brutalism (KPB) — Design Skill

**Version:** 1.0  
**Motto:** Expressive Composition. Disciplined Geometry. Playful Colors.  
**中文原则：** 构图自由、几何严谨、色彩鲜明。

## 0. Agent operating instructions

1. Read this skill before implementing a design task that invokes KPB.
2. Identify the deliverable type and select the matching scenario preset in §6. If the user provides overrides, prioritize those.
3. Apply the master design language (§1), tokens (§2), geometry (§3), typography and UX (§4), and exclusions (§5).
4. Treat all three adjustable parameters as integers from 0 to 100. Use §7 to translate them into concrete implementation choices. The default is **dynamism 65, decorative density 35, structural precision 90**.
5. Keep existing application behavior, content, data structures, routes, and business logic intact unless explicitly instructed otherwise. Design refactoring should not silently become feature refactoring.
6. For frontend tasks, inspect the existing framework and styling conventions before changing files. Prefer the project's existing design-token mechanism and components over introducing duplicate styling systems.
7. Implement the actual UI, not merely a mockup, when the request is for frontend development. For static graphics, deliver the requested asset format; do not assume that a raster reference is editable source artwork.
8. Run available checks and inspect the resulting UI at desktop and mobile breakpoints where feasible. Report what was actually tested, not what was assumed.
9. **Border uniformity is a hard requirement:** the visual language is dynamic, but outlines must remain clean, consistent, and geometrically intentional.

## 1. Master Design Prompt

> Design using a consistent visual language called **Kinetic Pop Brutalism (KPB)**.
>
> This aesthetic combines:
>
> - **Neo-Brutalism:** bold black outlines, hard offset shadows, flat surfaces, playful geometric blocks, high visual clarity.
> - **Japanese Action-Comic Composition:** dynamic diagonals, asymmetrical panels, sharp angular cuts, overlapping frames, and directional visual rhythm, without copying identifiable franchise motifs.
> - **American Comic Editorial Layout:** varied panel proportions, strong framing, visual hierarchy, halftone patterns, and expressive spatial storytelling.
> - **Contemporary Pastel Pop Design:** lavender backgrounds, pale lime, vibrant pink, soft lilac, warm off-white, and restrained black accents.
> - **Modern Digital Product Design:** clean typography, precise alignment, reusable components, accessible interaction patterns, and systematic spacing.
>
> The visual experience should feel energetic, playful, graphic, confident, and meticulously constructed.
>
> Create deliberate tension between **dynamic composition and structural precision**. Use irregular panel arrangements and asymmetric visual balance while maintaining mathematically consistent borders, alignment, and spacing.
>
> The design must feel like a professionally art-directed vector graphic, not a rough sketch or randomly assembled collage.
>
> Use clean, uniform near-black strokes; consistent hard-edged offset shadows without blur; sharp or minimally rounded corners; selective diagonal cuts and angular extensions. Keep primary content surfaces clean and readable. Concentrate decorations at panel boundaries, corners, and transitions.
>
> Use bold modern sans-serif headings, compact functional labels, and optional monospace metadata. Preserve strong information hierarchy, responsive behavior, accessible contrast, and predictable interaction.
>
> **Core principle: Expressive composition, disciplined execution.**

### Visual identity keywords

`kinetic` · `neo-brutalist` · `pastel pop` · `comic editorial` · `flat vector` · `asymmetrical grid` · `crisp outlines` · `hard shadows` · `halftone accents` · `controlled visual rhythm`

## 2. Design tokens

### 2.1 Color palette

These HEX values are **recommended standardized approximations**, not pixel-sampled measurements of the reference image.

| Token | HEX | Role |
|---|---|---|
| Lavender | `#8985E9` | Signature background, hero sections |
| Lime | `#DEFFA2` | Secondary actions, energetic framing accents |
| Pink | `#F38BDE` | Primary actions, highlights |
| Lilac | `#E5CCF7` | Secondary surfaces, headers, tabs |
| Cream | `#FFFDF4` | Main content surfaces and empty comic panels |
| Mint | `#B6F0E6` | Feedback, informational accents |
| Ink | `#17171F` | Outlines, typography, hard shadows |
| White | `#FFFFFF` | Neutral high-contrast surface |

**Suggested overall visual distribution:** Lavender 35%, Cream 35%, combined chromatic accents 25%, Ink 5%. This is a starting point, not a rigid quota. For reading-heavy products, increase Cream and reduce large lavender fields.

### 2.2 CSS implementation

```css
:root {
  /* Core palette */
  --kpb-lavender: #8985E9;
  --kpb-lime: #DEFFA2;
  --kpb-pink: #F38BDE;
  --kpb-lilac: #E5CCF7;
  --kpb-cream: #FFFDF4;
  --kpb-mint: #B6F0E6;
  --kpb-ink: #17171F;
  --kpb-white: #FFFFFF;

  /* Semantic aliases */
  --color-background: var(--kpb-lavender);
  --color-surface: var(--kpb-cream);
  --color-text: var(--kpb-ink);
  --color-primary: var(--kpb-pink);
  --color-secondary: var(--kpb-lime);

  /* Stroke & geometry */
  --border-color: var(--kpb-ink);
  --border-width: 2px;
  --border-width-strong: 3px;
  --radius-sm: 2px;
  --radius-md: 4px;

  /* Hard-edged offset shadows */
  --shadow-sm: 3px 3px 0 var(--kpb-ink);
  --shadow-md: 5px 5px 0 var(--kpb-ink);
  --shadow-lg: 8px 8px 0 var(--kpb-ink);

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}

.kpb-card {
  background: var(--color-surface);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}

.kpb-button {
  background: var(--kpb-pink);
  color: var(--kpb-ink);
  border: var(--border-width) solid var(--kpb-ink);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  font-weight: 700;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.kpb-button:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--kpb-ink);
}

.kpb-button:active {
  transform: translate(3px, 3px);
  box-shadow: 0 0 0 var(--kpb-ink);
}

.kpb-button:focus-visible {
  outline: 3px solid var(--kpb-ink);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .kpb-button { transition: none; }
}
```

**Implementation note:** Do not indiscriminately replace a host project's semantic tokens. Map KPB tokens into the existing theme where possible. Verify contrast for actual text size and interaction state; the palette alone does not guarantee WCAG compliance.

## 3. Geometry, composition, and decorative grammar

### 3.1 Borders and frames

- Web interfaces: normally **2–3px** black strokes.
- Large editorial illustrations: normally **3–5px** strokes, scaled to output resolution.
- Keep line width consistent **within a visual tier** (e.g., all primary panel outlines share the same width). Strong borders may be a distinct intentional tier.
- Preserve continuous joins and clean polygon corners. No wobbly, uneven, doubled, broken, or accidentally tapered outlines.
- Use sharp corners or very small corner radii (`2–4px` for UI).
- Avoid skewing whole interactive elements if it degrades text clarity or hit areas. Prefer a skewed decorative pseudo-element or background layer behind an unskewed content container.
- For static panel graphics, use vector paths with consistent stroke widths and aligned joins when editable output is required.

### 3.2 Composition

- Large dominant panels + smaller supporting panels.
- Asymmetrical editorial grids and intentionally varied proportions.
- Occasional diagonal dividers, controlled overlaps, sharp angular cutouts.
- Negative space is essential: visual energy belongs primarily **between** content areas.
- Prefer CSS Grid for layout structure, then apply decorative transforms to separate layers.
- On mobile, simplify complex panel geometry and restore logical reading order.

### 3.3 Decoration vocabulary

Allowed, used selectively: comic halftone dots, four-point sparkle stars, angular lightning motifs, small geometric arrows, sticker-like labels, floating tabs, offset color layers, thin curved motion lines, small dot clusters, sparse geometric fragments.

Decorative motifs should have a purpose (direction, hierarchy, grouping, emphasis) and must not obscure content. Do not place dense halftone textures behind long body copy.

### 3.4 Shadows and texture

- Hard offset shadows, **zero blur**.
- Flat color fields; gradients only if the user explicitly requests them.
- Halftone should be clean and deliberate, not distressed or dirty.
- Avoid grainy photographic backgrounds and heavy torn-paper grunge.

## 4. Typography and UX

- Bold contemporary sans-serif display headings; strong weight contrast.
- Compact readable functional labels and optional small monospace metadata.
- Distinguish headline, section title, body, label, and metadata tiers consistently.
- Avoid chaotic font mixing and decorative type in primary functional controls.
- Preserve predictable navigation, keyboard focus, touch targets, responsive layout, and readable surfaces.
- Prefer meaningful motion and interaction feedback over gratuitous animation.
- Ensure color is not the only state indicator.

## 5. Negative constraints / anti-patterns

**Do not include:**

- Recognizable Persona 5 / Persona 5 Royal characters, logos, iconography, or signature city/building skyline silhouettes.
- A red-and-black-dominated palette.
- Inconsistent or distorted stroke widths, wobbly edges, accidental double borders.
- Excessive grunge, distressed paper, random collage fragments.
- Heavy gradients, glassmorphism, blurred drop shadows, overly soft rounded cards.
- Randomly skewed form controls, unreadable text, cluttered information architecture.
- Decorations that block interaction or compete with important content.
- Unstructured asymmetry; every deviation from the grid should be deliberate.

The goal is to **retain comic energy and editorial rhythm without borrowing identifiable franchise assets**.

## 6. Four scenario prompts

Choose one prompt as the task-specific extension to §1. These are ready to reuse in design generators or as task instructions to a coding agent.

### A. Web frontend / SaaS / dashboard

**Use for:** practice platforms, dashboards, admin panels, portfolio and product websites.

**Emphasis:** restrained comic elements, regular card structure, consistent borders, clear hierarchy.

```text
Apply the Kinetic Pop Brutalism design system to this web interface.
Prioritize usability, precise CSS geometry, consistent 2px black borders,
hard offset shadows, lavender and cream surfaces, and restrained pink/lime accents.
Use comic-inspired diagonals only in hero sections, section dividers,
and decorative layers. Keep all functional content aligned to a responsive grid.
Preserve accessibility and existing functionality.
```

**Implementation rule:** Content-heavy pages use low decoration. Keep cards and inputs structurally regular; put expressiveness in section framing and selected hero graphics.

### B. Comic-panel template / poster / key visual

**Use for:** comic panels, promotional posters, visual backgrounds, covers, storyboards, key visuals.

**Emphasis:** stronger angled panels, asymmetric composition, blank panels, halftone and geometric accents.

```text
Create a wide landscape comic panel template in the Kinetic Pop Brutalism style.
Use an asymmetrical American-comic-inspired composition with 6–7 empty
warm-white panels, clean uniform black vector outlines, lavender background,
pastel lime and candy-pink offset layers, hard-edged shadows, small halftone
details, angular accents and minimal graphic stickers. Maintain consistent
stroke thickness and precise panel geometry. All panels must remain blank
and usable for future artwork. No text, characters, buildings, logos,
grunge or distorted borders.
```

**Implementation rule:** For an empty template, do not place stars, dots, or arrows over the main blank interior. Use decoration on borders and gutters. If the user requests an editable asset, create actual vector panels/layers rather than presenting a raster mockup as editable.

### C. Presentation / pitch deck / information design

**Use for:** product demos, launches, research presentations, pitch decks.

**Emphasis:** large headlines, clean information blocks, dynamic geometry with lower visual noise.

```text
Design a 16:9 presentation using Kinetic Pop Brutalism.
Combine oversized bold sans-serif headlines, warm-white content panels,
consistent black outlines, hard offset shadows, lavender backgrounds
and selective pastel lime/pink highlights. Use asymmetrical editorial
composition and controlled comic-inspired diagonals. Maintain clear
reading order, generous negative space, and high readability.
Limit decorative elements to margins and transitions.
```

**Implementation rule:** Make the information hierarchy and projection readability more important than the visual flourishes.

### D. UI components / design system

**Use for:** buttons, inputs, cards, tabs, modals, progress bars, navigation.

**Emphasis:** component consistency, state feedback, border/shadow discipline.

```text
Create a reusable Kinetic Pop Brutalism UI component library.
Use precise 2px near-black borders, sharp 2–4px corner radii,
consistent hard offset shadows, cream surfaces, lavender backgrounds,
lime secondary actions, and pink primary actions. Build buttons, cards,
tabs, inputs, modals, progress indicators and navigation components
with consistent spacing, hover, active, disabled and focus states.
Avoid irregular strokes, blurry shadows and excessive decorative
geometry inside functional controls.
```

**Implementation rule:** Share tokens and component primitives. Do not introduce one-off border widths or shadow offsets without an explicit semantic reason.

## 7. Adjustable visual parameters

All parameters accept integers in **[0, 100]**.

```yaml
kpb:
  comic_dynamism: 65
  decorative_density: 35
  structural_precision: 90
```

### 7.1 Comic dynamism (`comic_dynamism`)

Controls diagonal panel cuts, asymmetric framing, overlap, and directional motion.

| Value | Design behavior |
|---|---|
| 0–34 | Mostly regular grids, minimal angular accents |
| 35–69 | Moderate diagonals and selective asymmetry |
| 70–100 | Strong diagonal panels and expressive overlaps |

**Guardrail:** Do not rotate or skew core reading content solely to satisfy a high dynamism setting.

### 7.2 Decorative density (`decorative_density`)

Controls halftone dots, stars, tabs, geometric fragments, arrows and secondary motifs.

| Value | Design behavior |
|---|---|
| 0–29 | Very minimal; mostly typography and color blocks |
| 30–64 | Restrained accents concentrated around corners and panel transitions |
| 65–100 | Richer ornamentation, still organized and outside critical content |

**Guardrail:** Decoration may be abundant in posters but must not interfere with interaction or readability.

### 7.3 Structural precision (`structural_precision`)

Controls how strictly borders, alignment, geometry and spacing are normalized.

| Value | Design behavior |
|---|---|
| 0–79 | Consistent functional geometry with some expressive freedom |
| 80–100 | Strictly uniform outlines, precise alignment, clean vector geometry |

**Important:** A lower setting is **not permission** to introduce defects. Even at 0, maintain deliberate strokes, functional layout and legibility. For production UI, default to **90–100**.

### 7.4 Parameter-to-prompt template

```text
KPB style parameters:
Comic dynamism: {comic_dynamism}/100.
Decorative density: {decorative_density}/100.
Structural precision: {structural_precision}/100.

Comic dynamism:
- >=70: strong diagonal panels and expressive overlaps
- 35–69: moderate diagonals and selective asymmetry
- <35: mostly regular grids with minimal angular accents

Decorative density:
- >=65: rich but organized decorations
- 30–64: restrained decorations concentrated at corners
- <30: very minimal decorations

Structural precision:
- >=80: strictly uniform borders, precise alignment, clean vector geometry
- <80: consistent functional geometry with some expressive freedom

Never sacrifice readability, accessibility, or border integrity.
```

### 7.5 Scenario presets

| Scenario | Dynamism | Density | Precision |
|---|---:|---:|---:|
| General default | 65 | 35 | 90 |
| Website homepage hero | 75 | 45 | 90 |
| Dashboard / question practice page | 25 | 15 | 100 |
| Promotional poster | 90 | 65 | 90 |
| Comic-panel template | 85 | 45 | 100 |
| Presentation / pitch deck | 55 | 25 | 95 |
| Reusable UI component library | 20 | 10 | 100 |

### 7.6 Parameter precedence

1. Explicit user overrides for the current task.
2. Explicit task configuration (e.g. project-specific `kpb` YAML).
3. Matching scenario preset.
4. General default 65/35/90.

For multi-part projects, use different presets per area: e.g., hero at 75/45/90, practice screen at 25/15/100, buttons at 20/10/100. Do not apply a poster's visual density to every application screen.

## 8. Codex implementation workflow

### 8.1 Understand

- Inspect existing application structure, routes, components, styling and responsive behavior.
- Identify user-requested deliverable, intended audience, and information density.
- Choose the scenario and parameters; note any user constraints on dimensions or asset format.

### 8.2 Plan

- Map the existing palette and semantic styles to KPB tokens.
- Determine which regions can be expressive and which must remain structurally regular.
- Plan typography, content hierarchy, decorative layers, responsive fallback, and interaction states.
- Keep non-functional visual elements separate from semantic/interactive content.

### 8.3 Implement

- Define/reuse shared tokens and components.
- Apply uniform strokes and hard shadows across related component tiers.
- Build layout with responsive grid/flex primitives; add selective asymmetry via layered visuals.
- Preserve keyboard navigation, visible focus, and logical document order.
- Avoid adding dependencies solely for a simple decorative effect unless justified.

### 8.4 Validate

- Run available typecheck, lint, tests and build (as relevant).
- Inspect desktop and mobile layouts when preview/browser tools are available.
- Check that borders are uniform, joins are clean, offset shadows are consistent, and decorative layers do not cover content.
- Verify hover, focus, active and disabled states.
- Verify contrast, overflow, legibility and reduced-motion behavior where applicable.
- State which checks were completed and any remaining limitations.

## 9. Quality acceptance checklist

- [ ] The design is recognizably KPB without using P5R-specific imagery.
- [ ] Lavender, Cream, Pink and Lime establish the main visual identity.
- [ ] Panel and component outlines are crisp, uniform and intentional.
- [ ] Hard shadows have no blur and follow a consistent offset system.
- [ ] Diagonals and overlaps are deliberate rather than random.
- [ ] Functional content remains legible, aligned and accessible.
- [ ] Decorative elements are limited by the chosen density setting.
- [ ] Mobile reading order and interaction remain usable.
- [ ] Existing application behavior is preserved unless changes were requested.
- [ ] Final output matches the requested medium and editability requirements.

## 10. Reusable Codex task prompts

### Apply to an existing frontend

```text
Use the kinetic-pop-brutalism skill for this page.
Follow its master prompt, tokens, and Web Frontend scenario.
Preset: Dashboard / question practice page (25/15/100).
Preserve all existing functionality, routes, data and business logic.
Audit border widths, hard-shadow offsets, component spacing, color distribution,
responsive layout and keyboard interaction. Do not introduce unrelated design systems.
```

### Create a comic-style graphic

```text
Use the kinetic-pop-brutalism skill, Comic-panel / Poster scenario.
Preset: Comic-panel template (85/45/100).
Create a wide landscape template with 6–7 empty cream panels, uniform
black outlines, lavender base, pastel lime/pink accents and restrained
halftone decoration. No text or identifiable franchise symbols.
Keep every panel blank and make the borders consistent.
```

### Create a pitch deck

```text
Use the kinetic-pop-brutalism skill, Presentation scenario.
Preset: Presentation (55/25/95).
Create a clear 16:9 narrative with oversized headings, cream content
surfaces, uniform black borders and selectively dynamic geometry.
Prioritize readability and visual consistency over decoration.
```

### Build a component library

```text
Use the kinetic-pop-brutalism skill, UI Components scenario.
Preset: UI component library (20/10/100).
Implement reusable tokens, buttons, cards, tabs, inputs, dialogs,
progress bars and navigation with consistent outlines, hard shadows,
spacing and interaction states. Maintain accessibility and responsiveness.
```

## 11. Installation and usage

Place this file at:

```text
~/.agents/skills/kinetic-pop-brutalism/SKILL.md
```

Or keep a project-local copy at:

```text
<project-root>/.agents/skills/kinetic-pop-brutalism/SKILL.md
```

Then invoke the skill by name (if surfaced by your Codex environment) or ask Codex to read the file explicitly. If your environment does not auto-discover local skills, add a pointer in your repository's `AGENTS.md`.

Example `AGENTS.md` pointer:

```markdown
For frontend and graphic design work, read and follow
`.agents/skills/kinetic-pop-brutalism/SKILL.md`.
Use the scenario preset appropriate to the task and preserve existing behavior.
```

For a project-specific configuration, keep the following in the project instructions or a design configuration file:

```yaml
kpb:
  scenario: dashboard
  comic_dynamism: 25
  decorative_density: 15
  structural_precision: 100
```

**Final design rule:** Expressive composition, disciplined geometry, playful colors. Every dynamic gesture must be intentional; every border must be consistent.
