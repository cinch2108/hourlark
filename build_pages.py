# Generates one SEO page per tool from template.html. Run: python3 build_pages.py
import re, json, os
DOMAIN = "https://cinch2108.github.io/hourlark"
SELF = "hourlark"
# ---- "More free tools" team footer: edit this ONE list, then run `python3 build_pages.py`. ----
# Applied to every generated page plus privacy.html, terms.html and 404.html. The current site is left out.
TEAM = [
    ("chroma",     "Chroma",     "https://cinch2108.github.io/chroma/",     "Color palettes, contrast checker & gradients"),
    ("textforge",  "Textforge",  "https://cinch2108.github.io/textforge/",  "Word counter, JSON, Base64, diff & regex"),
    ("hourlark",   "Hourlark",   "https://cinch2108.github.io/hourlark/",   "Timer, stopwatch, Pomodoro & world clock"),
    ("numora",     "Numora",     "https://cinch2108.github.io/numora/",     "30 calculators & a unit converter"),
    ("pixelsmith", "Pixelsmith", "https://cinch2108.github.io/pixelsmith/", "Compress, resize & convert images"),
    ("mintkit",    "Mintkit",    "https://cinch2108.github.io/mintkit/",    "QR codes, barcodes & passwords"),
    ("tagloom",    "Tagloom",    "https://cinch2108.github.io/tagloom/",    "SEO tools: meta tags, sitemaps & schema"),
    ("postsmith",  "Postsmith",  "https://cinch2108.github.io/postsmith/",  "Social media tools: fancy text, counters & hashtags"),
    ("mediaforge", "Mediaforge", "https://cinch2108.github.io/mediaforge/", "Convert, compress & trim video and audio"),
    ("sheetwise",  "Sheetwise",  "https://cinch2108.github.io/datakit/",    "CSV & Excel tools: convert, clean & merge"),
    ("localforge", "LocalForge PDF", "https://cinch2108.github.io/",        "Merge, split, compress & sign PDFs"),
]
def team_html():
    items = ''.join(f'<li><a href="{u}" rel="noopener">{n}</a><span>{d.replace("&", "&amp;")}</span></li>' for k, n, u, d in TEAM if k != SELF)
    return f'<!--team--><nav class="more-tools" aria-label="More free tools"><h2>More free tools</h2><ul>{items}</ul></nav><!--/team-->'
def add_team(s):
    import re as _re
    if '<!--team-->' in s: return _re.sub(r'<!--team-->.*?<!--/team-->', lambda m: team_html(), s, flags=_re.S)
    if '<footer>' in s: return s.replace('<footer>', '<footer>' + team_html(), 1)
    return s.replace('</main>', '</main><footer>' + team_html() + '</footer>', 1)

BRAND = "Hourlark"
T = open('template.html', encoding='utf-8').read()
PAGES = [
 dict(p='timer', v='timer', slug='', tab='Timer', name='Online Timer',
  title='Online Timer: Free Countdown Timer with Alarm Sound | Hourlark',
  desc='Free online timer with presets, custom times, multiple timers, alarm sounds and fullscreen. Stays accurate in background tabs and counts down in the tab title.',
  h1='Online timer that <span>keeps perfect time.</span>',
  lead='Set a timer in one click, run several at once and hear a clear alarm when time is up. Hourlark times against your computer clock, so it stays accurate even when the tab is in the background.',
  how=['Click a preset such as 5 min or 25 min to start a timer right away.',
       'For a custom time, type hours, minutes and seconds and press Start, or type something like “7m”, “1h 30m” or “2:30” in the quick box and press Enter.',
       'Give the timer a name (for example “Pasta”) so you know which one is ringing. Add more timers to run them side by side.',
       'Choose an alarm sound and volume, then press Test to hear it. Turn on notifications if you want an alert while you are in another tab.',
       'Press Space to start or pause the first timer, R to reset and F for fullscreen. The time left also shows in the browser tab title.'],
  faq=[('Is the timer accurate when I switch tabs?','Yes. Browsers slow down background tabs, so Hourlark never counts ticks. It saves the exact moment your timer ends and compares it with your computer clock, so it finishes on time even if the tab was hidden or the screen was busy.'),
       ('Will I hear the alarm if the tab is in the background?','Yes, as long as the tab stays open and your device isn’t asleep or muted. The sound is scheduled ahead with the Web Audio API. You can also turn on desktop notifications for a pop-up alert.'),
       ('Can I run more than one timer?','Yes. You can run up to 12 timers at once, each with its own name. They keep running when you switch to other Hourlark tools such as the stopwatch or world clock.'),
       ('Do my timers survive a page refresh?','Yes. Timers are saved in your browser’s local storage with their end time, so a running timer keeps counting after you reload the page. Nothing is sent to a server.')]),
 dict(p='stopwatch', v='stopwatch', slug='stopwatch', tab='Stopwatch', name='Online Stopwatch',
  title='Online Stopwatch with Laps &amp; Splits (CSV Export) | Hourlark',
  desc='Free online stopwatch with lap and split times, fastest and slowest lap highlighting, keyboard shortcuts, fullscreen and CSV export. Accurate to the hundredth.',
  h1='Stopwatch with laps, <span>splits and CSV export.</span>',
  lead='Time runs, workouts, speeches and experiments to the hundredth of a second. Record laps with one key, see the fastest and slowest at a glance and export everything to a spreadsheet.',
  how=['Press Start or the Space bar to begin timing.',
       'Press Lap or the L key at the end of each lap. Each row shows the lap time, the running split and how it compares with your average.',
       'Your fastest lap is highlighted in green and your slowest in red once you have two or more laps.',
       'Press Space again to stop, and again to resume. Press R to reset.',
       'Use Copy or Download CSV to paste your laps into Excel, Google Sheets or a training log.'],
  faq=[('What is the difference between a lap time and a split time?','A lap time is how long that single lap took. A split time is the total time from the start up to the end of that lap. Hourlark shows both for every lap.'),
       ('How accurate is this stopwatch?','It measures elapsed time from your device clock and shows hundredths of a second. Because it uses timestamps instead of counting ticks, it stays accurate in background tabs and over long sessions.'),
       ('What are the keyboard shortcuts?','Space starts and stops, L records a lap, R resets and F switches to fullscreen. Shortcuts are paused while you type in a text box.'),
       ('Will I lose my laps if I close the tab?','No. The stopwatch and its laps are saved in your browser, so it keeps running and your laps are still there when you come back. Press Reset to clear them.')]),
 dict(p='pomodoro', v='pomodoro', slug='pomodoro-timer', tab='Pomodoro', name='Pomodoro Timer',
  title='Pomodoro Timer: Free Focus Timer with Tasks &amp; Stats | Hourlark',
  desc='Free Pomodoro timer with custom focus and break lengths, long breaks, auto-start, a task list, daily session stats, gentle sounds and optional notifications.',
  h1='Pomodoro timer that <span>keeps you in flow.</span>',
  lead='Work in focused 25-minute sessions with short breaks in between and a longer break after every four. Track tasks and see how many sessions you finish each day.',
  how=['Add the task you are working on and click it to make it the current task.',
       'Press Start (or Space) to begin a focus session. The ring shows how much of the session is left.',
       'When the session ends you hear a sound and the break starts. Turn on auto-start in Settings to move between focus and breaks automatically.',
       'After every few sessions (4 by default) you get a longer break. Press S to skip ahead or R to reset the current session.',
       'Check Today and the 7-day chart to see your sessions and focus minutes. Change lengths, sounds and cycles in Settings.'],
  faq=[('What is the Pomodoro Technique?','It is a time management method created by Francesco Cirillo. You work for 25 minutes, take a 5-minute break, and after four sessions take a longer 15–30 minute break. Short, timed sprints make it easier to start and to avoid burnout.'),
       ('Can I change the session and break lengths?','Yes. Open Settings to set focus, short break and long break lengths in minutes, choose how many sessions come before a long break, and choose whether breaks and focus sessions start automatically.'),
       ('Will I get a notification when a session ends?','Hourlark always plays a sound and shows a message. Desktop notifications are optional: they are only turned on after you click Enable notifications and allow them in your browser.'),
       ('Where are my tasks and stats stored?','Only in your browser’s local storage. There is no account and nothing is uploaded. Clearing your browser data will remove them.')]),
 dict(p='countdown', v='countdown', slug='countdown', tab='Countdown', name='Countdown Timer',
  title='Countdown Timer to Any Date: Days, Hours, Minutes, Seconds | Hourlark',
  desc='Count down to any date and time in any time zone. Live days, hours, minutes and seconds, one-click holidays like New Year and Christmas, and a shareable link.',
  h1='Countdown to <span>any date and time.</span>',
  lead='Create a live countdown to a launch, trip, wedding, exam or holiday. Pick the date, time and time zone, then share a link so everyone counts down to the same moment.',
  how=['Type a name for your event, such as “Launch day” or “Our trip”.',
       'Pick the date and time. Choose the event’s time zone so the countdown is right for everyone, wherever they are.',
       'Or click a preset such as New Year, Halloween, Thanksgiving or Christmas. Presets always pick the next upcoming date.',
       'Watch the days, hours, minutes and seconds count down live. Press F or Fullscreen to show it on a big screen.',
       'Click Copy share link and send it to friends. The link opens the same countdown on their device in their own browser.'],
  faq=[('Does the countdown handle time zones and daylight saving time?','Yes. The event time is set in the time zone you choose, and Hourlark uses your browser’s time zone database to work out the exact moment, including daylight saving changes. Viewers in other zones also see the time in their local time.'),
       ('Can I share my countdown?','Yes. Copy share link creates a URL with the event name, date, time and zone. Anyone who opens it sees the same live countdown. Nothing is stored on a server.'),
       ('What happens when the countdown reaches zero?','The card changes colour and the counter starts showing how long ago the event happened, so the page is still useful after the moment passes.'),
       ('Can I put the countdown on a TV or projector?','Yes. Press F or the Fullscreen button for a large, clean display, and tick Keep screen awake so the screen does not dim.')]),
 dict(p='worldclock', v='worldclock', slug='world-clock', tab='World clock', name='World Clock',
  title='World Clock: Current Local Time in Cities Worldwide | Hourlark',
  desc='See the current time in cities around the world on analog and digital clocks. Search 130+ cities and every IANA time zone, with day/night indicators and 12/24h.',
  h1='World clock for <span>every city you care about.</span>',
  lead='Keep the time for your team, family and favourite cities side by side. Clocks show day or night, the date and how many hours ahead or behind they are.',
  how=['Type a city, country or time zone abbreviation (like “Tokyo”, “India” or “PST”) in the search box.',
       'Use the arrow keys and Enter, or click, to add a clock. Your own local time is always shown first.',
       'Switch between analog, digital or both, and between 12-hour and 24-hour time.',
       'The sun and moon icons show whether it is day, twilight or night there, based on the real position of the sun.',
       'Remove a clock with the ✕ button. Your list is saved in your browser for next time.'],
  faq=[('Are daylight saving time changes included?','Yes. Every clock uses the official IANA time zone database built into your browser, so daylight saving time switches happen automatically on the correct dates for each country.'),
       ('Which cities can I add?','More than 130 major cities are built in with their country and coordinates, and you can also add any of the 400+ IANA time zones by name, such as America/Boise or Asia/Kathmandu.'),
       ('How does the day and night indicator work?','Hourlark calculates the sun’s height above the horizon for each city’s coordinates. A sun means daytime, a half circle means twilight, and a moon means night.'),
       ('Is my list of clocks saved?','Yes, in your browser’s local storage on this device. There is no account and no data leaves your device.')]),
 dict(p='converter', v='converter', slug='time-zone-converter', tab='Time zones', name='Time Zone Converter',
  title='Time Zone Converter &amp; Meeting Planner (DST Aware) | Hourlark',
  desc='Convert any time between time zones with daylight saving handled automatically, and find meeting times with a working-hours overlap planner. Free share links.',
  h1='Time zone converter and <span>meeting planner.</span>',
  lead='Pick a date and time in one city and instantly see it everywhere else. The planner colours each hour by working hours so you can find a slot that works for the whole team.',
  how=['Choose the date and time, and the time zone it is in. Press Now to use the current time.',
       'Add cities or time zones with the search box. Each row shows the converted time, the date and whether it is the next or previous day.',
       'Look at the meeting planner: green hours are inside working hours, yellow are early or late and grey are night.',
       'The top line tells you when everyone is in working hours. Click any hour in the grid to convert that time.',
       'Change working hours if your team keeps different hours, then click Copy share link to send the exact time to others.'],
  faq=[('Does the converter handle daylight saving time?','Yes, for the exact date you choose. For example, New York is normally 5 hours behind London, but for a few weeks in March and late October/early November the gap is 4 hours because the US and UK change their clocks on different dates. Hourlark gets this right automatically.'),
       ('What happens if I pick a time that doesn’t exist?','When clocks spring forward, an hour is skipped (for example 2:30 AM in New York on March 8, 2026). Hourlark warns you and moves the time forward to the first valid moment. When clocks fall back and a time happens twice, it uses the first one and tells you.'),
       ('How do I find the best meeting time?','Add everyone’s city and look for the column where all rows are green. Hourlark lists those ranges for you. If there is no full overlap, pick the slot with the most green and the fewest grey cells.'),
       ('Can I send the converted time to someone?','Yes. Copy share link creates a URL with the date, time and zones. When someone opens it, they see the same moment converted into all the listed zones.')]),
 dict(p='alarm', v='alarm', slug='alarm-clock', tab='Alarm', name='Alarm Clock',
  title='Online Alarm Clock: Free Alarm with Sounds &amp; Snooze | Hourlark',
  desc='Free online alarm clock with multiple labelled alarms, repeat days, six built-in sounds, volume, snooze and a 5-second test so you know it will ring.',
  h1='Online alarm clock that <span>you can trust.</span>',
  lead='Set as many alarms as you need with labels, repeat days, sounds and snooze. Test it first: the alarm rings in 5 seconds so you know your volume is right.',
  how=['Pick the alarm time and add an optional label such as “Stand-up meeting”.',
       'Choose repeat days, or leave them all off for a one-time alarm that switches itself off after it rings.',
       'Choose a sound, volume and snooze length. Press Preview to hear the sound.',
       'Press Test: ring in 5 s to check your speakers and volume before you rely on it.',
       'Keep this tab open and your device awake. When the alarm rings, press Stop or Snooze (Esc also stops it).'],
  faq=[('Does the alarm work if I close the tab?','No. A web page can only ring while it is open. Keep the Hourlark tab open (it can be in the background), keep your device plugged in and awake, and make sure the volume is up and not muted.'),
       ('Will the alarm ring if my computer goes to sleep?','Not while it is asleep. Browsers stop running pages when a device sleeps. If your device wakes up after the alarm time, Hourlark rings straight away and marks it as late. For important wake-ups, also set an alarm on your phone.'),
       ('Can I set repeating alarms?','Yes. Pick the days of the week for each alarm, for example weekdays only. One-time alarms switch off automatically after they ring.'),
       ('How long does snooze last?','You can choose 5, 9, 10 or 15 minutes for each alarm. Press Snooze when it rings and it will ring again after that time.')]),
]
def rel(d, p): return ('../' * d) + p
def href(d, q): return rel(d, q['slug'] + '/' if q['slug'] else '') or './'
def page_url(p): return f"{DOMAIN}/{p['slug'] + '/' if p['slug'] else ''}"
strip = lambda s: re.sub(r'<[^>]+>', '', s).replace('&amp;', '&')

assert T.count('data-ad-slot=') == 4
for p in PAGES:
    d = 1 if p['slug'] else 0
    s = T
    s = re.sub(r'<title>.*?</title>', f"<title>{p['title']}</title>", s, flags=re.S)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{p["desc"]}">', s)
    s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{page_url(p)}">', s)
    s = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{page_url(p)}">', s)
    s = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{p["title"]}">', s)
    s = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{p["desc"]}">', s)
    s = re.sub(r'<meta name="twitter:title" content="[^"]*">', f'<meta name="twitter:title" content="{p["title"]}">', s)
    s = re.sub(r'<meta name="twitter:description" content="[^"]*">', f'<meta name="twitter:description" content="{p["desc"]}">', s)
    attrs = f' data-view="{p["v"]}" data-page="{p["p"]}"' + ('' if p['slug'] else ' data-home="1"')
    s = s.replace('<body>', f'<body{attrs}>', 1)
    s = re.sub(r'<h1>.*?</h1>', f"<h1>{p['h1']}</h1>", s, count=1, flags=re.S)
    s = re.sub(r'(<section class="hero">.*?)<p>.*?</p>', lambda m: m.group(1) + f"<p>{p['lead']}</p>", s, count=1, flags=re.S)
    s = s.replace('<div class="logo"><i></i>Hourlark</div>', f'<a class="logo" href="{href(d, PAGES[0])}" aria-label="{BRAND} home"><i></i>{BRAND}</a>', 1)
    tabs = ''.join(f'<a class="tab{" active" if q is p else ""}" data-p="{q["p"]}" data-v="{q["v"]}" data-name="{q["name"]}" href="{href(d, q)}"{" aria-current=" + chr(34) + "page" + chr(34) if q is p else ""} title="{q["name"]} (Alt+{i + 1})">{q["tab"]}</a>' for i, q in enumerate(PAGES))
    s = re.sub(r'<nav class="tabs" id="tabs" aria-label="Tools">.*?</nav>', f'<nav class="tabs" id="tabs" aria-label="Tools">{tabs}</nav>', s, flags=re.S)
    s = s.replace('class="view active"', 'class="view"').replace(f'class="view" id="v-{p["v"]}"', f'class="view active" id="v-{p["v"]}"')
    for a in ['styles.css', 'app.js', 'privacy.html', 'terms.html']:
        s = s.replace(f'"{a}"', f'"{rel(d, a)}"')
    others = ''.join(f'<a href="{href(d, q)}">{q["name"]}<span>{q["desc"].split(". ")[0].rstrip(".")}.</span></a>' for q in PAGES if q is not p)
    art = f'''<article class="seo">
<h2>How to use the {p["name"].lower().replace("pomodoro", "Pomodoro")}</h2>
<ol>{''.join(f"<li>{x}</li>" for x in p["how"])}</ol>
<h2>Frequently asked questions</h2>
{''.join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in p["faq"])}
<h2>More free time tools</h2>
<div class="toollinks">{others}</div>
</article>'''
    s = s.replace('<!-- AD SLOT: footer 728x90 -->', art + '\n<!-- AD SLOT: footer 728x90 -->', 1)
    faq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": strip(q), "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in p["faq"]]}
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": BRAND, "item": DOMAIN + "/"}] + ([{"@type": "ListItem", "position": 2, "name": p["name"], "item": page_url(p)}] if p['slug'] else [])}
    ld = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')
    s = s.replace('</head>', f'<script type="application/ld+json">{ld(faq)}</script>\n<script type="application/ld+json">{ld(crumbs)}</script>\n</head>', 1)
    out = (p['slug'] + '/index.html') if p['slug'] else 'index.html'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    s = add_team(s)
    open(out, 'w', encoding='utf-8').write(s)

open('sitemap.xml', 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + ''.join(f'  <url><loc>{page_url(p)}</loc><lastmod>2026-10-25</lastmod></url>\n' for p in PAGES)
    + f'  <url><loc>{DOMAIN}/privacy.html</loc></url>\n  <url><loc>{DOMAIN}/terms.html</loc></url>\n</urlset>\n')
print('built', len(PAGES), 'pages')

# team footer on the static pages
for _f in ['privacy.html', 'terms.html', '404.html']:
    _s = open(_f, encoding='utf-8').read()
    open(_f, 'w', encoding='utf-8').write(add_team(_s))
