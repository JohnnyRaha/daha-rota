# Dāha Wellness · Rota and capacity

A scheduling and capacity-planning tool for the front of house, café, therapist and studio teams. It runs entirely in the browser: no server, no account and no external libraries. Nothing entered into it leaves the browser unless you export it.

## Run it

Open `index.html` in a browser. Everything is saved in that browser on that computer; use **Google Sheets → Backup** to move it elsewhere.

It starts with a fictional sample team so you can see how it works. Replace it with **Google Sheets → Clear everything**, then add people on the Team tab or import them from a sheet.

## What it does

- **Team** — each person's main area, the areas they are trained to work in, the treatments they can do (for therapists), contracted hours, working days and hours, holidays and notes. Working hours can be the same every week or a four-week rotation.
- **Coverage needs** — how many people each area needs and when, per day. A therapist shift can ask for a specific treatment. The treatment list and the start of the four-week rotation are set here too.
- **Rota** — a week view. Add or change shifts by clicking; shifts that break a rule (not trained, does not do the treatment, on holiday, outside working hours, overlapping, over contracted hours) are marked. A coverage strip shows where each area is short.
- **Fill the gaps / Build best rota** — builds the rota automatically within the rules.
- **Coverage gaps** — every uncovered stretch, with the people who could cover it, ranked. Options that would need an exception (a non-working day, outside usual hours, over contracted hours) are listed separately with the reason.
- **Capacity** — hours needed against hours the team can give, per area, per day, per treatment and per person, with plain-language findings (for example where an area depends on cross-trained cover, where the hours exist but at the wrong times, or where only one person does a treatment).

## How the automatic rota works

It fills treatment-specific cover first, then the hardest gaps (those with the fewest people able to cover them). For each gap it prefers someone who can cover the whole block, then people whose main area it is, then specialists over multi-skilled staff (so flexible people stay free for gaps only they can fill), then whoever has the most unused contracted hours. A second pass moves people between shifts where that closes a remaining gap.

It never breaks a rule. It is a heuristic: it produces a good rota quickly, not a mathematically proven best one, so a gap it leaves can sometimes be closed by hand.

## Reading the team from a sheet

Use **Google Sheets → Read from Google Sheet** with the sheet's link, or **Import a file** with an .xlsx or .csv. Two layouts are understood.

**A tab per team.** Tabs named Therapists, FOH, BaristasAttendants, Instructors and Acupuncturists. Each person is a block: a row with their name and the days of the week, then a row per rotation week ("WEEK 1", "WEEK 2 & 4", "Weekly") with times written freely ("7:30AM - 3:30PM (8hrs)", "9-4:30pm"). The importer:

- sets each person's area from the tab they are on, and treats a name that appears on two tabs as one person trained in both;
- gives people on the Acupuncturists tab the Acupuncture treatment;
- reads weekly hours from a note such as "32 hours/week" where there is one, and otherwise takes them from the availability listed;
- corrects times whose AM/PM cannot be right (for example "11:30PM - 07:30PM (8hrs)" is read as 11:30 to 19:30);
- sets the cover needed from a "Weekly Shifts" tab;
- lists everything it could not read or had to assume, so it can be checked by hand.

**One row per person.** Columns:

| Column | Required | Example |
| --- | --- | --- |
| Name | yes | Example Person |
| Skills | yes (or one column per area marked Y) | Studio, Front of House |
| Primary role | no | Studio |
| Treatments | no | Massage, Reflexology |
| Hours | no | 30 |
| Mon … Sun | no | 08:00-16:00 |
| Holidays | no | 2026-12-24 to 2026-12-31; 2027-01-02 |

People are matched by name, and columns that are missing leave existing details untouched. Importing over the sample team replaces it.

Reading from a link needs the sheet shared as "Anyone with the link can view", which lets anyone with the link read all of it. To keep a sheet private, download it from Google Sheets as an Excel file and import the file: it is read in the browser and not uploaded.

## Exporting the rota

1. *Copy rota for Google Sheets*, then paste into any sheet. No set-up.
2. *Send rota to Google Sheet* writes three tabs for the week (Rota, Shifts, Gaps) directly. One-off set-up: paste `apps-script.gs` into the sheet's Apps Script editor, deploy it as a web app (Execute as: Me, Access: Anyone) and paste the web app URL into the tool. The steps are also shown on the tab.

Anyone with the web app URL can write rota tabs to that sheet, so keep it private; set `KEY` in the script and the same key in the tool for a second check.

## Exporting to Trybe

Trybe (try.be) has no spreadsheet import for rotas. In Trybe a practitioner's rota is a repeating cycle of weeks made of rules (week number, weekday, from, to), with dated "custom availability" for time off, created on its schedule screen or through its API (documented at https://docs.try.be).

**Google Sheets → Export for Trybe** converts the four weeks starting at the week on screen into that shape:

- one rota per practitioner, as a 1, 2 or 4-week cycle depending on how their four weeks repeat, in the request body that `POST /shop/practitioner-rotas` expects;
- holidays as custom-availability blocks for `POST /shop/practitioners/{practitionerId}/custom-availability`;
- only shifts in the chosen bookable areas (by default therapists and studio), so front-of-house or café time is not offered for bookings.

**Send straight to Trybe.** The same card can connect to Trybe directly. The first time, it asks for a Trybe API token and whether to use the Playground (test) or Live environment. It then looks up each person in Trybe by name, shows their current rota next to the new one, and proposes what to do: create the rota, end the current one the day before and start the new one, or skip. Nothing is sent until you confirm, and existing rotas are ended, not deleted. The token is stored in the browser only (for the session, or on that computer if you choose), separately from the rota data, and is not part of backups.

Getting a token: Trybe does not issue API tokens inside the app. Email tech-support@try.be asking for an API key, and include the email of the Trybe user the token should belong to, which environments you need (playground, production or both) and a short description of the integration. Tokens are issued per environment and carry the permissions of that user.

To try the flow without a token, press **Try it with a simulated Trybe**. It builds a pretend Trybe from your team inside the page, including a person with a current rota, one matched on first name only, one with a future rota and one who is missing, and sends nothing anywhere.

For the file export, two things have to be added from Trybe itself: each person's practitioner ID, and offering IDs if a window should be limited to particular treatments. Neither the file nor the direct connection has been run against a real Trybe account yet; try the Playground first. A CSV version of the same rotas is available for entering them by hand.

## Files

- `js/data.js` — data model, storage and the sample team
- `js/engine.js` — rule checks, gap detection, suggestions, the auto-scheduler and capacity figures
- `js/sheets.js` — reading sheets and workbooks (including .xlsx), and exporting the rota
- `js/trybe.js` — the direct connection to Trybe
- `js/ui.js` — the interface
- `apps-script.gs` — the script for one-click export
