# Návod pro Lukáše

Všechny kroky, které musíš udělat ty (účty, platby, přihlášení), seřazené podle toho, kdy je potřeba.

---

## A. Hned teď — GitHub CLI (jednorázově, 2 minuty)

V Claude Code napiš do promptu (znak `!` spustí příkaz přímo v terminálu):

```
! sudo apt install -y gh
! gh auth login
```

V `gh auth login` vyber: **GitHub.com → HTTPS → Yes (authenticate Git) → Login with a web browser**, opiš kód do prohlížeče.
Ověření: `! gh auth status` → musí ukázat `Logged in to github.com account LukasHrdy11`.

Díky tomu může Fable/Claude sám pushovat a zapnout GitHub Pages.

---

## B. Spuštění Fable (dnes)

1. V terminálu: `cd ~/python-ws/Portfolio && claude`
2. Přepni model: `/model` → vyber **Fable 5.2**.
3. Napiš: **`Přečti CLAUDE.md a PLAN.md a proveď fázi 1.`**
4. Až Fable napíše `⏸ FÁZE 1 HOTOVÁ`, otevři v prohlížeči adresu, kterou ti dá (typicky `http://localhost:4321/`), projdi web a napiš **OK** nebo připomínky (klidně česky, konkrétně: „nadpis je moc velký“, „chci víc modré“…).
5. Po OK Fable commitne, pushne a řekne ti, ať napíšeš `/clear`. Pak: **`Pokračuj fází 2 podle PLAN.md.`** — a tak dál až po fázi 5.

Tipy, jak šetřit limit:
- `/clear` mezi fázemi je důležitý (každá fáze začíná s čistým kontextem, vše potřebné je v PLAN.md).
- Připomínky piš najednou v jedné zprávě, ne po kouskách.
- Stav limitu: claude.ai → Settings → Usage. Když dojde, další fáze může dokončit i běžný model (Opus) — stav je vždy v PLAN.md.

---

## C. Zapnutí GitHub Pages (po prvním pushi ve fázi 1)

Na https://github.com/LukasHrdy11/Lukas_Hrdy_portfolio → **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
(Fable to může udělat sám přes `gh`, pokud jsi přihlášený.)

Web pak poběží na **https://lukashrdy11.github.io/Lukas_Hrdy_portfolio/** (první nasazení trvá ~2 min; průběh: záložka **Actions**).

---

## D. Doména lukashrdy.cz (kdykoliv, cca 15 min + čekání na DNS)

**Cena (ověřeno 14. 11. 2026 na https://vedos.cz/domeny):** registrace `.cz` 160 Kč bez DPH = **193,60 Kč s DPH za 1. rok, prodloužení stejně 193,60 Kč/rok**. (WEDOS se přejmenoval na **VEDOS** – vedos.cz je správný web.) `lukashrdy.cz` 14. 11. 2026 v DNS neexistovala → téměř jistě volná; dostupnost potvrdí vyhledávání na vedos.cz.

### D1. Koupě
1. https://vedos.cz/domeny → zadej `lukashrdy.cz` → objednat.
2. Založ účet (jméno, e-mail, adresa – údaje držitele domény jsou v registru CZ.NIC, ale u fyzických osob se veřejně nezobrazují).
3. **Nekupuj** hosting, e-mail ani jiné doplňky – stačí jen doména. Zapni automatické prodlužování, ať o doménu nepřijdeš.
4. Zaplať (193,60 Kč).

### D2. Ověření domény v GitHubu (ochrana proti převzetí)
1. GitHub → klikni na svůj avatar → **Settings → Pages → Add a domain** → `lukashrdy.cz` → **Add domain**.
2. GitHub ukáže TXT záznam: název `_github-pages-challenge-LukasHrdy11` a hodnotu (náhodný kód).
3. Ve VEDOS administraci → doména → **DNS záznamy** → přidej záznam typu **TXT** s tímto názvem a hodnotou.
4. Po chvíli (až 24 h) v GitHubu u domény: **⋯ → Continue verifying → Verify**. TXT záznam pak nemaž.

### D3. DNS záznamy pro web (ve VEDOS → DNS záznamy)
Smaž případné výchozí A/AAAA/CNAME záznamy pro `@` a `www`, které VEDOS vytvořil (parkovací stránka), a přidej:

| Název | Typ | Hodnota |
|---|---|---|
| *(prázdné / @)* | A | 185.199.108.153 |
| *(prázdné / @)* | A | 185.199.109.153 |
| *(prázdné / @)* | A | 185.199.110.153 |
| *(prázdné / @)* | A | 185.199.111.153 |
| *(prázdné / @)* | AAAA | 2606:50c0:8000::153 |
| *(prázdné / @)* | AAAA | 2606:50c0:8001::153 |
| *(prázdné / @)* | AAAA | 2606:50c0:8002::153 |
| *(prázdné / @)* | AAAA | 2606:50c0:8003::153 |
| www | CNAME | lukashrdy11.github.io. |

(Zdroj: docs.github.com → Pages → Managing a custom domain. Nepoužívej wildcard `*`.)

### D4. Přepnutí webu na doménu
1. Repo → **Settings → Pages → Custom domain** → `lukashrdy.cz` → Save. Počkej na zelenou kontrolu DNS, pak zaškrtni **Enforce HTTPS** (certifikát může trvat až hodinu).
2. Repo → **Settings → Secrets and variables → Actions → záložka Variables → New repository variable**:
   - `SITE_URL` = `https://lukashrdy.cz`
   - `BASE_PATH` = `/`
3. Repo → **Actions → Deploy → Run workflow** (nebo jakýkoliv push) → web se postaví pro novou adresu.
4. Ověř https://lukashrdy.cz a https://www.lukashrdy.cz.

**Nezávislost na GitHubu:** doména je tvoje u VEDOS. Kdyby GitHub nešel, stačí `npm run build`, nahrát složku `dist/` na jiný statický hosting (Cloudflare Pages, Netlify, VEDOS webhosting…) a ve VEDOS přepsat DNS záznamy.

---

## E. Jak upravovat obsah webu a CV

Všechno o tobě je v jednom souboru: **`content/profile.yaml`** (návod je v jeho hlavičce).

1. Otevři `content/profile.yaml` v editoru (VS Code), uprav text – vždy `cs:` i `en:`.
2. Lokálně zkontroluj (volitelné): `npm run dev` → http://localhost:4321/ ; CV: `npm run cv`.
3. Nahraj:
   ```
   git add content/profile.yaml
   git commit -m "Update profile"
   git push
   ```
4. GitHub Actions za ~2–3 min postaví web **i obě PDF verze CV** (česky + anglicky).

Časté úpravy:
- **Nový projekt / zkušenost / ocenění:** zkopíruj existující položku v příslušném seznamu a přepiš ji.
- **Jen do CV, ne na web:** přidej `web: false`. **Jen na web:** `cv: false`.
- **Videa:** v sekci `outreach.videos` doplň `youtube_id` (11 znaků z `youtube.com/watch?v=XXXXXXXXXXX`).

---

## F. Otevřené TODO (doplň, až budeš mít chvíli)
- [x] YouTube videa, trend kMC, čísla deuteronu, formulace u medicíny — vyřešeno 14. 11. 2026.
- [x] Období YouTube kanálu změněno na „03/2024 – “.
