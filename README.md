# Stav og Regn

En lille lære-app til et barn på ca. 6 år: **stave** og **regne** på barnets eget niveau.
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

**Tilpasser sig selv:** 5 rigtige i første forsøg giver nyt niveau. 3 opgaver i træk
med fejl går stille og roligt et niveau ned. Efter to forkerte tryk viser appen det
rigtige bogstav, så barnet ikke går i stå. Der er stjerner og fejring for hver løst opgave.

**For voksne:** hold tandhjulet nede på forsiden i 1,5 sekund. Her kan man skrive
barnets navn, vælge STORE/små bogstaver, slå lyd fra, sætte niveauet manuelt og se statistik.

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

**Lyd er slået fra indtil videre.** Sæt `SOUND_ENABLED = true` øverst i `app/js/app.js`
for at få oplæsning og lydeffekter igen. Så vises også lyd-indstillingerne på voksen-siden.

**Oplæsning (når lyden er slået til):** appen bruger telefonens egen tekst-til-tale. Hvis den taler engelsk:
Android-indstillinger → Tekst-til-tale → Google → installér **dansk** stemme.
Brug "Test stemmen" på voksen-siden for at tjekke.

## Kør lokalt

```sh
cd app
python3 -m http.server 8000
```
Åbn http://localhost:8000.

## Tilføj flere ord eller opgaver

Alt indhold ligger i `app/js/data.js`. Et nyt ord er bare en linje, f.eks.
`{ word: 'hund', emoji: '🐶' }` i den rigtige længde-gruppe. Vælg helst lydrette ord.

Når filer ændres, så hæv versionsnummeret i `CACHE` i `app/sw.js`, hvis du vil være sikker
på at alle får den nye version med det samme (ellers kommer den ved næste åbning).

## Senere: rigtig APK eller Google Play

Hvis du vil have en .apk-fil, kan den udgivne side pakkes med [PWABuilder](https://www.pwabuilder.com)
(gratis). APK'en kan installeres direkte på telefonen. Google Play kræver en
udviklerkonto (engangsbeløb på 25 USD), men det er ikke nødvendigt for at bruge appen.
