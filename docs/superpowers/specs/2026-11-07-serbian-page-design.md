# alexkonyakhin.com: Serbian page and language switch

Design spec · 7 November 2026 · Status: approved in conversation, awaiting owner review of this document

Extends the homepage spec (`2026-11-07-fractional-cpo-page-design.md`, "the
homepage spec"). Everything there still binds; this document adds a second
page and the links between the two.

## 1. Purpose

A Serbian-language version of the homepage for buyers in Serbia and the
region, reached from a small language switch in the header. It is a faithful
translation of the approved English page with four lines adapted for a local
reader. The English page stays the default and is unchanged except for the
switch, the alternate-language links and one analytics parameter.

## 2. Content rules

In addition to the homepage spec §2:

- Serbian in Latin script (latinica). No Cyrillic version in this iteration.
- Formal address, lowercase "vi".
- Serbian number conventions: thousands with a dot (20.000), decimals with a
  comma (2,15×). Multipliers and "300k+" stay as on the English page.
- "Fractional CPO" stays in English. Product-world terms that Serbian tech
  readers use untranslated stay untranslated: head of product, product lead,
  CTO, QA, pipeline, dashboard, tech lead, PM.
- The owner's name is spelled as on the domain and LinkedIn.
- Only these four lines differ in meaning from the English page: the fit line,
  the first trust-strip item, the third trust-strip item, and the description
  meta tag's geography. Every fact and number is the same as in homepage spec §4.
- The owner reviews the Serbian text line by line before implementation
  (open item in §9).

## 3. The Serbian page, in page order

### 3.1 Header

Skip link: "Preskoči na sadržaj". Identity link `href="/sr/"` (the Serbian
page is its own home), aria-label: "Alexey Konyakhin, početna". Role line: "Fractional CPO · Beograd". Navigation in page order:
"Projekti" → `#work`, "Kako radim" → `#how-i-work`, "Iskustvo" →
`#background`, then the language switch "English" → `/` (see §4).

### 3.2 First screen

H1: **Fractional CPO za softverske kompanije koje vode osnivači.**

Subhead: Preuzimam odgovornost za pravac proizvoda, prioritete i isporuku
zajedno sa vašim postojećim timom, tako da važan posao napreduje, a da svaka odluka ne mora da prolazi kroz vas.

Fit line (adapted): Za kompanije koje imaju korisnike koji plaćaju i interni
razvojni tim. Srbija, region, EU i UK.

Trust strip (aria-label "Lokacija, jezici i fakturisanje"):

- Beograd · sastanci uživo ili onlajn (adapted)
- Radni jezici: srpski i engleski
- Registrovani preduzetnik u Srbiji · fakturisanje u RSD ili EUR (adapted)
- Proizvod i inženjering od 2013..

Calls to action: primary button **Zakažite razgovor od 30 minuta** (booking
page); text link **Pogledajte projekte** → `#work`.

### 3.3 Proof band (aria-label "Ključne činjenice")

| Numeral | Label | Qualifier |
|---|---|---|
| 300k+ | mesečno aktivnih korisnika | aplikacija za zaposlene koju sam vodio kao head of product |
| 3× | mesečni promet | mreža mobilne štampe, april 2024 – jun 2026 |
| 20.000 | prijava za posao | u prva tri meseca procesa zapošljavanja koji sam vodio |
| 3 | suosnovane kompanije | 2015 – 2022 |

### 3.4 Projekti

**Case 1**

Title: Aplikacija za zaposlene velikog maloprodajnog lanca
Context line: Head of product za celu aplikaciju · Maloprodaja · Rusija

Vodio sam proizvod: pravac, prioritete, istraživanje, isporuku i merenje.
Vodio sam programere, dizajnera i QA i iznosio hipoteze i odluke pred najviše
rukovodstvo.

Results: label "Mesečno aktivni korisnici", value "300k+", qualifier "tokom mog
rada na proizvodu"; label "Prijave za posao", value "20.000", qualifier "u prva
tri meseca procesa zapošljavanja".

- Analitika: od događaja do odluka. Vodio sam implementaciju kompletnog
  analitičkog sistema sa timom: pokrivenost događaja u Firebase-u, pipeline ka
  BigQuery-ju i prilagođene Looker dashboarde koji su rukovodstvu dali uvid u
  to kako zaposleni koriste aplikaciju.
- Proces zapošljavanja. Otvorili smo aplikaciju i za one koji još nisu
  zaposleni, tako da su kandidati za posao kasira i radnika u prodavnicama mogli
  direktno da se prijave.
- Igra za učenje. Ideja jednog zaposlenog koju sam pretvorio u igru unutar
  aplikacije, zasnovanu na postojećim materijalima za obuku, i pilotirao u 16
  operativnih klastera.

**Case 2**

Title: Copix, mreža mobilne štampe (name links to https://copix.app/)
Context line: Rad na proizvodu sa osnivačkim timom · Rusija · 2024 – 2026

Radio sam sa timom na mobilnom korisničkom putu, povraćaju novca za neuspele
otiske i povratnim informacijama od podrške ka proizvodu.

Results: label "Mesečni promet karticama", value "3×", qualifier "april 2024 –
jun 2026"; label "Promet po aktivnom štampaču", value "2,15×".

Note: Rezultati cele mreže tokom saradnje, uz promene cena i same mreže.

After the second case: the primary button **Zakažite razgovor od 30 minuta**.

### 3.5 Kada me osnivači zovu

- Tim isporučuje, ali poslovni prioritet stalno pada u drugi plan.
- Jedna inicijativa obuhvata proizvod, inženjering i operacije, a nema vlasnika.
- Previše odluka i dalje dolazi do vas.

### 3.6 Kako radim

1. **Plaćeni prvi mesec.** Dogovaramo se oko poslovnog problema, gledamo dokaze koje
   već imate i postavljamo jedan prioritet sa jasnim vlasnicima i praktičnim
   planom. Obim prati pristup, ljude i budžet koje zaista možete da obezbedite.
2. **Zatim iz meseca u mesec.** Ako se uklopimo, nastavljam kao vaš fractional
   CPO: pravac proizvoda, kompromisi, zavisnosti između proizvoda, inženjeringa
   i operacija, i držanje posla uz cilj koji smo dogovorili. Broj dana nedeljno
   i obim dogovaramo pojedinačno.
3. **Kontrolne tačke, bez vezivanja.** Polazno stanje i kriterijumi uspeha
   postavljaju se unapred. Na svakom pregledu nastavljamo, menjamo obim ili
   završavamo urednom primopredajom.

"Ko šta radi" box: Ja vodim pravac proizvoda, prioritete, kompromise,
usklađivanje stejkholdera i merenje. Vi ste vlasnik poslovnog cilja, budžeta,
pristupa i prava odlučivanja. Vaš CTO i tim odgovorni su za tehnički kvalitet, procene i svakodnevnu isporuku.

Scope note: Nije uključeno: neograničen razvoj, stalna dostupnost, agencijski tim iza mene niti garantovani rezultati.

### 3.7 Iskustvo

| Godine | Uloga |
|---|---|
| 2025 – danas | CPO, platforma za komercijalne nekretnine |
| 2024 – 2026 | Rad na proizvodu sa Copixom, mreža mobilne štampe |
| 2023 – danas | COO i product lead, Erasoft.io, tim koji stoji iza aplikacije za zaposlene u maloprodaji |
| 2022 | Senior Project Manager, Improvado, međunarodni tim |
| 2020 – 2022 | Osnivač, LTVCAC.agency, performans marketing i JTBD istraživanja |
| 2017 – 2019 | Suosnivač, Togezzer, interna komunikacija za distribuirane timove |
| 2015 – 2017 | Suosnivač, Knedlik Tech, mobilna aplikacija za putovanja |
| 2013 – 2015 | PM i tech lead, Globus, portfolio mobilnih i veb projekata |

Below: "Pravim i sopstvene proizvode." with the same three product links
(aria-label "Sopstveni proizvodi"). The 2026 role row is omitted, as on the
English page, until the owner supplies wording.

### 3.8 Contact

Heading: Razgovarajmo o vašem proizvodu.

Prompt: Recite mi nešto o svom proizvodu, timu koji imate i onome što ne
napreduje. Iskreno ću vam reći da li mogu da pomognem.

Options: primary button **Zakažite razgovor od 30 minuta** (booking page),
**Pišite mi na Telegramu** (Telegram), **Pošaljite imejl** (mailto); the
address shown beneath as plain text.

### 3.9 Footer

"Alexey Konyakhin · Beograd", links LinkedIn and Telegram.

## 4. The language switch

- English page: a link "Srpski" with `href="/sr/"`, `lang="sr-Latn"`,
  `hreflang="sr-Latn"`, placed last in the header navigation.
- Serbian page: a link "English" with `href="/"`, `lang="en"`,
  `hreflang="en"`, placed last in the header navigation.
- Visually a nav link with a little extra space before it; same size and
  colour as the other nav links, 44px minimum height.
- No redirect, no cookie, no detection of browser language.

## 5. Metadata and search wiring

Serbian page:

- `<html lang="sr-Latn">`
- Title: "Alexey Konyakhin · Fractional CPO · Beograd"
- Description: "Fractional CPO iz Beograda. Preuzimam pravac proizvoda,
  prioritete i isporuku zajedno sa vašim postojećim timom. Plaćeni prvi mesec,
  zatim mesečno. Srbija, EU i UK."
- Canonical: https://alexkonyakhin.com/sr/
- Open Graph: title = H1, description = subhead, `og:url` the canonical,
  `og:locale` "sr_RS", image and image alt as on the English page.
- Person structured data as on the English page, with `description`
  "Fractional CPO iz Beograda za softverske kompanije koje vode osnivači."

Both pages carry the same three alternate links:

```html
<link rel="alternate" hreflang="en" href="https://alexkonyakhin.com/">
<link rel="alternate" hreflang="sr-Latn" href="https://alexkonyakhin.com/sr/">
<link rel="alternate" hreflang="x-default" href="https://alexkonyakhin.com/">
```

English page additions only: the three alternate links, `og:locale` "en_GB",
the switch link, and the analytics parameter below.

## 6. Analytics

Same gated snippet on both pages. The `cta_click` event gains `lang`, the
first part of the page's `lang` attribute ("en" or "sr"), alongside `cta` and
`location`. No other tracking.

## 7. Build, check, profile, README

- `scripts/site.py`: `PUBLIC_FILES` gains `sr/index.html`; the build creates
  `dist/sr/`; the unexpected-files guard checks `dist/sr/` too; symlink
  checks cover the folder. The preview server needs no change.
- `scripts/check.py`: checks run over both pages with per-language required
  copy, title, description and `lang`. Internal hrefs `/` and `/sr/` are
  allowed. New parity checks: identical sets of element ids, identical counts
  of h2, h3 and h4, identical (cta, location) sets, identical multisets of
  external destinations, each page carries the three alternate links above,
  and each page's switch points at the other. `check_dist` compares the full
  relative file tree of `dist/` with `PUBLIC_FILES`.
- `llms.txt`: stays English; one line "Serbian version:
  https://alexkonyakhin.com/sr/" in the Contact section.
- `README.md`: documents the two pages, the switch and the rule that copy
  changes are made on both pages and verified by the check script.

## 8. Verification before asking for publication approval

- `python3 scripts/check.py` (with the private terms file) passes; build
  succeeds; `dist/` holds exactly seven files; `git diff --check` clean.
- Serbian page in the browser at 1280 and 360px: no horizontal overflow,
  diacritics render, headline line count noted, switch works both ways,
  keyboard order includes the switch, no console errors.
- The English page re-checked at 1280 and 360px after its small changes.
- Both pages' JSON-LD parse.

## 9. Open items

| Item | Fallback if unanswered |
|---|---|
| Owner confirms invoicing in RSD is offered | Line becomes "Registrovani preduzetnik u Srbiji · fakturisanje u EUR" |
| Owner confirms formal "vi" | Stays formal |
| Owner's line-by-line review of the Serbian text | Implementation proceeds with the text in §3; corrections become a follow-up commit |

## 10. Git and publication

Branch `feature/serbian-page` from `main`. Pull request into `main`; merging
publishes, so the owner approves after the local preview, as before.

## 11. Out of scope

- A Cyrillic version.
- A sitemap file (the alternate links are sufficient for two pages).
- A Serbian `llms.txt`.
- Automatic language detection or redirects.
- Translating the design spec, plan or README.
