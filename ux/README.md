# HighWise UX kit

Static HTML frames matching [HighWise UX Design](../docs/helpdesk/technical-spec.md) companion doc tokens:

| Token | Value | Use |
|-------|-------|-----|
| Navy | `#0B1F3A` | Rail, primary buttons |
| Gold | `#C49425` | Wise, Reach chip, active tab |
| Cream | `#F6F1E6` | Page ground |
| Paper | `#FFFcf6` | Tables and cards |
| Bands | Fit / Reach / Likely | Never Target / Safety |

## Frames

- `index.html` — kit index
- `c1-caseload.html` — counselor caseload (`/app`)
- `c3-list.html` — college list (the product)
- `s1-home.html` — student home (`/s`, 390)
- `s2-list.html` — student list cards

Official lockup: `logo.svg` (cap + two chevrons). Do not ship a shield-H, a star, or “High Wise” as two words.

## Preview

```bash
npx --yes serve ux -p 4173
```

Open http://localhost:4173
