# Stav og Regn

En lille lære-app til et barn på ca. 6 år: **stave**, **regne**, **mønstre** og **ugens ord** på barnets eget niveau.
Den kører som en web-app (PWA), der installeres på Android-telefonen/tabletten som en
almindelig app, virker uden internet og koster ikke noget at hoste.

## Hvad kan den?

**Stave** (ordet bliver læst højt, og der vises et billede)
1. Første bogstav – vælg hvilket bogstav ordet starter med
2. Korte ord (is, sol, kat …) – byg ordet med bogstavbrikker
3. Ord med 4 bogstaver (fisk, måne, æble …)
4. Lange ord (banan, elefant, jordbær …)

**Regne** (med billeder man kan trykke på for at tælle højt)
1. Tæl til 5 · 2. Tæl til 10 · 3. Plus til 5 · 4. Plus til 10 · 5. Minus til 10 ·
6. Plus til 20 · 7. Plus og minus til 20

**Mønstre** (find det næste i rækken)
1. Mønstre med 2 ting (🔴🔵🔴🔵 ?) · 2. Sværere mønstre (🐶🐶🐱 …) · 3. Mønstre med 3 ting ·
4. Tal der vokser (3 4 5 6 ?) · 5. Tæl frem og tilbage (7 6 5 4 ?) ·
6. Spring og huller (2 4 _ 8 · 10 20 30 ? · 5 10 15 ?)

**Ugens ord** (skolens ord, skrevet ind af en voksen)
Ordet vises stort, skjules, og barnet staver det med brikker ("se, husk, stav"). "Kig igen" viser ordet kort.

**Runder og klistermærker:** En runde er 10 opgaver med en fremdriftslinje øverst. Til sidst
kommer en afslutning med pokal og et nyt klistermærke til albummet (📒 på forsiden). En perfekt
runde giver to. Manglende klistermærker står som silhuetter i albummet.

**Øver de svære ord:** Ord med fejl kommer oftere igen, indtil de er stavet rigtigt to gange i træk.

**Tilpasser sig selv:** 5 rigtige i første forsøg giver nyt niveau. 3 opgaver i træk
med fejl går stille og roligt et niveau ned. Efter to forkerte tryk viser appen det
rigtige bogstav, så barnet ikke går i stå. Der er stjerner og fejring for hver løst opgave.

**For voksne:** hold tandhjulet nede på forsiden i 1,5 sekund. Her kan man skrive ugens ord,
se runder pr. dag den sidste uge og rigtige i første forsøg pr. område, se de svære ord, sætte
niveauet manuelt, skrive barnets navn, vælge STORE/små bogstaver og slå lyd fra.

Alt gemmes kun på enheden – ingen login, ingen server, ingen data sendes nogen steder hen.

## Gratis hosting med GitHub Pages

1. Sørg for at koden ligger på en gren der hedder `main`.
2. På GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Hver gang `main` opdateres, udgiver workflowet `.github/workflows/pages.yml`
   appen på `https://<dit-brugernavn>.github.io/<repo-navn>/`.

GitHub Pages er gratis for offentlige repos. Er repoet privat på en gratis konto, kan man
i stedet koble repoet til **Cloudflare Pages** eller **Netlify** (begge gratis) og sætte
"output/publish directory" til `app`.

## Installér på Android

1. Åbn adressen i **Chrome** på telefonen.
2. Tryk på menuen (⋮) → **Installér app** / **Føj til startskærm**.
3. Appen får sit eget ikon og åbner i fuld skærm – også uden internet.

## Lyd og oplæsning

Appen bruger **færdige lydfiler** i `app/audio/` i stedet for telefonens robotstemme. Det betyder
naturlig dansk udtale, og lyden virker også uden internet. Mangler en fil, er der bare stille.

- **Lydeffekter** (`sfx-*.mp3`) laves med `python3 tools/make_sfx.py`.
- **Oplæsning** laves med `tools/make_voice.py` og [OmniVoice](https://github.com/k2-fsa/OmniVoice),
  som også er motoren i [VoiceStudio](https://github.com/debpalash/VoiceStudio). Scriptet læser alle
  tekster fra `app/js/data.js`, så nye ord automatisk kommer med. Allerede lavede filer springes over.

**Med din egen stemme (anbefales).** Optag 5-10 sekunders tydelig tale, f.eks. "Hej med dig. Nu skal vi
øve os på at stave og regne.", og lav alle klip igen:

```sh
# Med VoiceStudio-appen kørende (lav først en stemmeprofil, f.eks. "Far"):
python3 tools/make_voice.py --voicestudio --voice "Far" --force

# Eller direkte med OmniVoice (pip install torch torchaudio omnivoice):
python3 tools/make_voice.py --ref min-stemme.wav --ref-text "Hej med dig. Nu skal vi øve os på at stave og regne." --force
```

Det går hurtigt med et grafikkort. Uden grafikkort tager det cirka et minut pr. klip.
OmniVoice-modellens vægte er licenseret CC-BY-NC, dvs. kun til ikke-kommerciel brug. Det passer til en
privat app til familien.

## Kode og tests

- `app/js/data.js` – alt indhold (ord, niveauer, klistermærker, sætninger).
- `app/js/logic.js` – reglerne uden skærm: opgaver, svarmuligheder, niveauskift, runder,
  klistermærker, svære ord, ugens ord og indlæsning af gemte data.
- `app/js/app.js` – skærmene.
- `tests/` – tests uden afhængigheder, inkl. en golden master for alle opgavetyper. Kør:

```sh
npm test            # eller: node --test tests/*.test.js
UPDATE_GOLDEN=1 npm test   # kun efter en bevidst ændring af opgaverne
```

## Kør lokalt

```sh
cd app
python3 -m http.server 8000
```
Åbn http://localhost:8000.

## Tilføj flere ord eller opgaver

Alt indhold ligger i `app/js/data.js`. Et nyt ord er bare en linje, f.eks.
`{ word: 'hund', emoji: '🐶' }` i den rigtige længde-gruppe. Vælg helst lydrette ord.

Kør derefter `tools/make_voice.py`, så de nye ord også bliver læst op.

Når filer ændres, så hæv versionsnummeret i `CACHE` i `app/sw.js`, hvis du vil være sikker
på at alle får den nye version med det samme (ellers kommer den ved næste åbning).

## Senere: rigtig APK eller Google Play

Hvis du vil have en .apk-fil, kan den udgivne side pakkes med [PWABuilder](https://www.pwabuilder.com)
(gratis). APK'en kan installeres direkte på telefonen. Google Play kræver en
udviklerkonto (engangsbeløb på 25 USD), men det er ikke nødvendigt for at bruge appen.
