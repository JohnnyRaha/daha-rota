# Dāha Wellness · Rota and capacity

A scheduling and capacity-planning tool for the front of house, café, therapist and studio teams. It runs entirely in the browser: no server, no account and no external libraries.

## Run it

Open `index.html` in a browser. Everything is saved in that browser on that computer; use **Google Sheets → Backup** to move it elsewhere.

It starts with a fictional sample team so you can see how it works. Replace it with **Google Sheets → Clear everything**, then add people on the Team tab or import them from a sheet.

## What it does

- **Team** — each person's main area, the areas they are trained to work in, contracted hours, working days and hours, and holidays.
- **Coverage needs** — how many people each area needs and when, per day. Defaults follow the published opening hours.
- **Rota** — a week view. Add or change shifts by clicking; shifts that break a rule (not trained, on holiday, outside working hours, overlapping, over contracted hours) are marked. A coverage strip shows where each area is short.
- **Fill the gaps / Build best rota** — builds the rota automatically within the rules.
- **Coverage gaps** — every uncovered stretch, with the people who could cover it, ranked. Options that would need an exception (a non-working day, outside usual hours, over contracted hours) are listed separately with the reason.
- **Capacity** — hours needed against hours the team can give, per area, per day and per person, with plain-language findings (for example where an area depends on cross-trained cover, or where the hours exist but at the wrong times).

## How the automatic rota works

It fills the hardest gaps first (those with the fewest people able to cover them). For each gap it prefers someone who can cover the whole block, then people whose main area it is, then specialists over multi-skilled staff (so flexible people stay free for gaps only they can fill), then whoever has the most unused contracted hours. A second pass moves people between shifts where that closes a remaining gap.

It never breaks a rule. It is a heuristic: it produces a good rota quickly, not a mathematically proven best one, so a gap it leaves can sometimes be closed by hand.

## Google Sheets

**Reading the team.** Paste the sheet's link on the Google Sheets tab. The sheet must be shared as "Anyone with the link can view". Columns:

| Column | Required | Example |
| --- | --- | --- |
| Name | yes | Orla Byrne |
| Skills | yes (or one column per area marked Y) | Studio, Front of House |
| Primary role | no | Studio |
| Hours | no | 30 |
| Mon … Sun | no | 08:00-16:00 |
| Holidays | no | 2026-12-24 to 2026-12-31; 2027-01-02 |

People are matched by name. Columns that are missing leave the existing details untouched. A CSV file with the same columns can be imported instead, and a template can be downloaded from the tab.

**Exporting the rota.** Two ways:

1. *Copy rota for Google Sheets*, then paste into any sheet. No set-up.
2. *Send rota to Google Sheet* writes three tabs for the week (Rota, Shifts, Gaps) directly. One-off set-up: paste `apps-script.gs` into the sheet's Apps Script editor, deploy it as a web app (Execute as: Me, Access: Anyone) and paste the web app URL into the tool. The steps are also shown on the tab.

Anyone with the web app URL can write rota tabs to that sheet, so keep it private; set `KEY` in the script and the same key in the tool for a second check.

## Files

- `js/data.js` — data model, storage and the sample team
- `js/engine.js` — rule checks, gap detection, suggestions, the auto-scheduler and capacity figures
- `js/sheets.js` — Google Sheets import and export
- `js/ui.js` — the interface
- `apps-script.gs` — the script for one-click export
