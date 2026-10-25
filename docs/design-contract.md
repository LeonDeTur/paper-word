# Paperword interface

A personal tool for daily reading. The library is the main screen; adding an article is its primary action. The reader prioritizes English text, followed by translations and word actions. Review presents a question, answer reveal and rating.

Visual direction: a calm editorial reader, warm light background, green accent in the light theme, and Georgia for article text and large headings. At the user's request, the dark theme is fully monochrome: #000000 background, white text and gray elements without colored accents. The reference is the actual Spatial-RAG HTML with RU / RU ALL. A marketing screen is unnecessary.

Validated viewports: **1440×900** and **390×844**. Desktop uses persistent side navigation; mobile uses bottom navigation with theme and sign-out actions in Settings. Long titles wrap. Validated screens have no horizontal overflow. Body text uses a width-constrained reading column.

States:

- Loading: “Opening your library…” and an indicator; animation respects prefers-reduced-motion.
- Empty library: explanation and a button to add the first article.
- Error: a description, preserved user input and a retry action; model-server unavailability is tested separately.
- Partial data: the original remains accessible with incomplete translation; translated block counts and missing translations are explicit.
- Success: imported material appears in the library; saved words appear in vocabulary; reviews in both directions persist.
- Access: a password screen precedes the personal library; signing out prevents private API access.

Accessibility: native buttons, forms and dialog; field labels, visible focus, focus restoration after dialog closure and keyboard-accessible word actions. A separate “Word / phrase” action works without clicking text. Review supports buttons and keyboard shortcuts. Axe checks contrast on rendered screens; this is not a complete accessibility certification.

Local screenshots and validation observations are saved to `artifacts/qa/evidence.json`. Images show a clearly identified learning fixture from an isolated test.
