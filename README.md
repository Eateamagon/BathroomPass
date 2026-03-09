# BathroomPass

A digital hall pass system for schools, built on Google Apps Script. Students search their name on a kiosk touchscreen, select a destination (Bathroom, Nurse, Office), and receive a timed pass. Teachers can monitor active passes and review logs in Google Sheets.

## Architecture

- **Backend**: Google Apps Script (`Code.gs`) with Google Sheets as the database
- **Frontend**: Single-page app in `Index.html` (HTML + CSS + vanilla JS)
- **Deployment**: Google Apps Script Web App, designed for kiosk Chromebooks

## Screens

1. **Search** — Student types name or lunch number
2. **Destination** — Choose Bathroom, Nurse, or Office
3. **Active Pass** — Live timer with 5-minute alert
4. **Success** — Confirmation with auto-reset after 8 seconds

---

## Design System: Bauhaus

The frontend follows a **Bauhaus-inspired design system** — constructivist modernism that celebrates geometric purity, primary color theory, and the principle that form follows function.

### 1. Design Philosophy

**Vibe**: Constructivist, Geometric, Modernist, Artistic-yet-Functional, Bold, Architectural

The interface is a **geometric composition**. Every section is constructed rather than decorated. Think of a 1920s Bauhaus poster brought to life: shapes overlap, borders are thick and deliberate, colors are pure primaries, and everything is grounded by stark black and clean white.

**Key Characteristics**:
- **Geometric Purity**: All decorative elements derive from circles, squares, and triangles
- **Hard Shadows**: 3px–8px offset shadows (never soft/blurred) create depth through layering
- **Color Blocking**: Sections use solid primary colors as backgrounds
- **Thick Borders**: 2px and 4px black borders define every major element
- **Asymmetric Balance**: Grids are used but intentionally broken with overlapping elements
- **Constructivist Typography**: Massive uppercase headlines with tight tracking
- **Functional Honesty**: No gradients, no subtle effects — everything is direct and declarative

### 2. Design Tokens

#### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--red` | `#D02020` | Bauhaus Red — destructive actions, alerts, nurse destination |
| `--blue` | `#1040C0` | Bauhaus Blue — primary actions, pass header, bathroom destination |
| `--yellow` | `#F0C020` | Bauhaus Yellow — highlights, destination pills, office destination |
| `--black` | `#121212` | Stark Black — text, borders, foreground |
| `--white` | `#FFFFFF` | Card backgrounds |
| `--bg` | `#F0F0F0` | Off-white canvas background |
| `--muted` | `#E0E0E0` | Disabled/placeholder states |

#### Typography
- **Font Family**: [Outfit](https://fonts.google.com/specimen/Outfit) — geometric sans-serif with circular letterforms
- **Weights**: 400 (body), 500 (default), 700 (bold/labels), 900 (headlines)
- **Headlines**: `font-weight: 900`, `text-transform: uppercase`, `letter-spacing: -0.03em`, `line-height: 0.9`
- **Labels**: `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.1em+`
- **Body**: `font-weight: 500`

#### Border & Radius
- **Radius**: Binary extremes only — `0` (sharp rectangles) or `9999px` (perfect circles). No in-between.
- **Border widths**: `2px` (secondary) or `4px` (primary/cards)
- **Border color**: Always `#121212` (black) for maximum contrast

#### Shadows (Hard Offset)
| Size | Value |
|------|-------|
| Small | `3px 3px 0px 0px #121212` |
| Medium | `6px 6px 0px 0px #121212` |
| Large | `8px 8px 0px 0px #121212` |

No blur radius — shadows are sharp and architectural.

### 3. Component Patterns

#### Buttons
- **Thick black border** (`4px`) with hard offset shadow
- **Uppercase bold text** with letter-spacing
- **Press effect**: `transform: translate(4px, 4px)` + `box-shadow: none` on `:active`
- **Variants**: Red (destructive), Blue (primary), Yellow (highlight), White/outline (secondary)

#### Cards
- White background, `4px` black border, `8px` hard shadow
- **Corner decoration**: Small geometric shape (circle/square) in top-right via `::after`
- Sharp corners only (`border-radius: 0`)

#### Search Results
- Items separated by `2px` black borders
- Hover/active state: yellow highlight (`--yellow`)
- Grade badges: Blue background with black border, no radius

#### Geometric Logo
Three shapes in a row — red circle, blue square, yellow triangle — forming the brand identity. Present on every screen.

### 4. Interaction & Animation

- **Duration**: 150–200ms (fast, mechanical)
- **Easing**: `ease-out` (decisive, not bouncy)
- **Button press**: Translate + remove shadow simulates physical press
- **Screen transitions**: Subtle fade-up (8px translateY over 200ms)
- **Loading spinner**: Square (not circular) with multi-color borders, sharp rotation

### 5. Background Texture

A subtle dot grid pattern covers the page at 4% opacity:
```css
radial-gradient(#121212 1px, transparent 1px)
background-size: 24px 24px
```

### 6. Responsive Behavior

- **Mobile-first** single-column layout, `max-width: 600px`
- Typography scales down on small screens (`< 480px`)
- Touch-optimized: large tap targets, no hover-dependent interactions
- Kiosk-hardened: no text selection, no context menu, no pinch-zoom

### 7. Accessibility

- ARIA labels and roles on all interactive elements
- `aria-live` regions for dynamic content (timer, toast, loading)
- High contrast maintained throughout (black on white/yellow, white on blue/red)
- Semantic HTML structure
