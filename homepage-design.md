# 🏠 Naba Quran — Homepage Design Spec (LOCKED)

> This file is the permanent reference for the homepage layout.
> Any session working on the homepage MUST match this spec exactly.
> Reference image: generated mockup showing card-based dark green Islamic app.

## Layout Order (top → bottom)

### 1. HERO AREA
- Dark green gradient background (#173d2e → #0d2419)
- Floating orb decorations (orb1, orb2) — keep existing
- Top bar: 🕌 Naba Quran brand (left), 🔍 📅 buttons (right)
- Bismillah in gold Arabic calligraphy
- "Assalamu Alaikum ❤️" greeting + Hijri date chip
- 3 stat pills in a row: 114 Surahs | Tasbih count | Streak

### 2. INSTALL + DAILY AYAH (CARD)
- Rounded card with subtle gradient
- "📲 Install App" button (FIX: must work, show fallback if PWA not available)
- "🔔 Daily Ayah" button (gold gradient)
- Both styled as pill buttons inside the card

### 3. SEARCH BAR (CARD)
- Rounded search card with magnifying glass icon
- Placeholder: "Search Quran, Dua, Prophets, Stories…"

### 4. CONTINUE READING (CARD) — hidden if no progress
- Dark green gradient card
- 📖 icon + surah name + "Resume →" button

### 5. NEXT PRAYER (CARD)
- Prayer name, countdown timer, time
- 5 small prayer time pills: Fajr, Dhuhr, Asr, Maghrib, Isha

### 6. AZAN ALARM (CARD) — keep existing
- Bell icon, toggle, expandable voice options

### 7. QUICK TOOLS GRID (CARD)
- 3×2 grid of icon tiles:
  1. 📿 Tasbih → tasbih view
  2. 🤲 Duas → dua view  
  3. 🧭 Qibla → qibla view
  4. 🌟 Prophets → prophets view
  5. ✨ AI Guide → ai view
  6. 🌙 Night Radio → night view
- Each tile: rounded, subtle bg, icon + label

### 8. DAILY WISDOM / HADITH (CARD)
- Star emoji, hadith text, source
- Keep existing content, ensure card styling

### 9. HELP & PRIVACY (CARD)
- Small card at bottom
- "📞 Help & Contact" → help view
- "🔒 Privacy Policy" → privacy view
- Two items side by side or stacked

## CSS Requirements
- Every section is a card: rounded 16px, subtle border, subtle bg
- Card entrance animation: fade-in + slide-up on scroll (IntersectionObserver)
- Cards have gentle hover/active states (scale .98 on tap)
- Dark theme: --card, --bdr, --txt, --txt2 variables
- Gold accents: --gold (#c9a84c) for highlights
- No raw sections floating without a card container

## Install Button Fix
- Check deferredPrompt — if available, call prompt()
- If not available (iOS/desktop), show toast: "Use browser menu → Add to Home Screen"
- Button must never silently fail

## DO NOT
- Do not add complex SVG illustrations or canvas drawings
- Do not use external frameworks
- Do not break existing JS functions (prayer times, tasbih, etc.)
- Do not remove any existing features
