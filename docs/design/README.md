# Design concept

The visual system for this app, carried over from the eScrew design concept (`design-concept-v1.png`
and its Glass Manifest). Only the concept came across — the palette, the type scale, the material
and the principles behind them. None of eScrew's product code, features, or screens did.

The concept lives in code at `apps/web/src/styles/tokens.css`. That file is the source of truth;
this document explains what the values mean and why they are what they are.

## Palette

One token set, resolved into two palettes. Every surface colour carries alpha — the glass has
nothing to blur without it.

| Role | Light | Dark |
|---|---|---|
| `--bg` | `#F6F7FA` | `#0B1220` |
| `--surface` | `rgb(255 255 255 / 72%)` | `rgb(19 27 44 / 72%)` |
| `--surface-strong` | `rgb(255 255 255 / 88%)` | `rgb(24 33 53 / 88%)` |
| `--surface-solid` | `#FFFFFF` | `#131B2C` |
| `--text` | `#0F172A` | `#F5F7FA` |
| `--muted` | `#687280` | `#8B95A5` |
| `--line` | `rgb(15 23 42 / 9%)` | `rgb(139 149 165 / 18%)` |
| `--accent` | `#2D7DFF` | `#4C8DFF` |
| `--highlight` | `#A58B4F` | `#C9AC72` |
| `--danger` | `#E5484D` | `#EB6F79` |
| `--good` | `#2E9E6D` | `#4FBE8E` |

Theme resolution is class-based. `AppFrame` already resolves the "system" preference in JavaScript
and stamps `theme-dark` on `<html>`, so `tokens.css` keys the dark palette off that class. A
`prefers-color-scheme` block would fight it and flip the palette twice for a user on a system-dark
device who chose light.

## Type

The system font — SF Pro on Apple, Segoe/Roboto elsewhere — at four roles, plus a monospace face
reserved strictly for numbers.

| Role | Size / line | Weight |
|---|---|---|
| Title | 28 / 34 | 600 |
| Header | 17 / 22 | 600 |
| Body | 15 / 22 | 400 |
| Caption | 13 / 18 | 400–500 |
| Mono / numbers | 18, tabular | 600 |

Two text weights, not six. The previous look ran on 650–900; those are all 600 now.

## Material

Every elevated surface is translucent, blurred and shadowed — never flat-opaque. Blur strength
scales with how far the layer sits above its background.

| Tier | Blur | Surface | Shadow |
|---|---|---|---|
| Card / list | `blur(24px) saturate(1.4)` | 72% alpha | `0 10px 24px / .10` |
| Tab bar | `blur(32px) saturate(1.5)` | 72% alpha | `0 10px 24px / .10` |
| Sheet | `blur(28px) saturate(1.4)` | 88% alpha | `0 20px 60px / .16` |
| App header | `blur(32px) saturate(1.55)` | `--header-glass` | inset highlights + `0 .7rem 1.6rem` |

The tab bar and the header carry the strongest blur because they are the layers that always sit
above moving content. The header keeps a material of its own rather than taking the sheet tier: it
is the only surface sitting directly on the photograph, so it needs the inset highlights that read
as a glass edge against moving sky, and a text halo so the title holds its edge over whatever is
behind it.

## Principles

**Glass is additive.** Get the flat palette and layout right first, then add blur, translucency and
shadow as one final pass on top. Adding it earlier makes contrast bugs hard to see. The concept
pass at the end of `global.css` is deliberately last for this reason.

**One palette, sourced everywhere.** No literal colour in a component rule. A full re-theme is a
one-file edit. `global.css` currently declares zero hex codes and zero `rgb()` literals.

**Numbers are monospaced.** Anything a user reads as a number — times, durations, dates, amounts —
takes the mono face and `tabular-nums`, even inside otherwise proportional text. A countdown whose
digits shift width every second is the thing this prevents.

**Colour carries state, not whole rows.** A day off is a green badge on a normal card, not a green
card. Flooding a row with colour turns it into a status banner and stops the eye finding the route,
which is what a roster is scanned for.

**The chrome is the exception to the palette.** The eScrew concept puts cards on a flat canvas, but
this app keeps its sky wallpaper and the glass header above it — that frame is the product's
identity, and the header material is tuned against the photograph rather than against `--bg`.
Both live in the `chrome` token group and resolve per theme like everything else, so the exception
is declared in one place instead of leaking literals back into component rules. Dark mode veils the
same photograph rather than swapping in another, so the header glass has the same thing to blur in
both themes.

**Privacy.** No credential, token or session enters app state — only the data the user explicitly
imports, and it never leaves the device. This is a design constraint as much as an engineering one:
the UI never implies a cloud that is not there.

## What was not carried over

The Glass Manifest's engineering section documents React Native mechanics — `Platform.select` for
`backdrop-filter`, `Animated.spring` sheets, a `PanResponder` swipe-to-dismiss, an Expo build-time
version stamp. This app is plain React on the web, so those have direct CSS equivalents and are not
ported: blur is a CSS property here, not a platform cast.
