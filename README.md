# Raghuram Realtor — lead form with Zoho Forms backend

A custom inquiry form matching the *Raghuram Realtor Inquiry Form* brief: 18 numbered questions, navy · gold · white branding, RE/MAX Optimum Realty details, and a dedicated thank-you page.

- Fields, labels, options, and required rules mirror the Zoho form exactly.
- Submissions are stored in Zoho Forms under **Raghuram Realtor**.
- Visitors see a branded thank-you page after a successful submission.
- No API keys, OAuth setup, or Zoho paid plan required.

> The previous green-and-cream design is preserved in `previous-design/` for reference. It is not served by `server.js`.

---

## Why is there a server?

Zoho's public form endpoint does **not** send CORS headers, so a browser cannot post JSON to it from another domain. The included `server.js` relays the submission:

```
Browser  →  /api/submit (your server)  →  forms.zohopublic.in/.../records  →  Zoho Forms
```

The relay uses the same public endpoint and payload as Zoho's own hosted form. It adds no secrets and cannot read your Zoho account.

---

## Run it locally

1. Make sure [Node.js](https://nodejs.org) 18 or newer is installed.
2. Open a terminal in this folder.
3. Run:

   ```bash
   npm start
   ```

   or simply:

   ```bash
   node server.js
   ```

4. Open <http://localhost:3000>.

> Opening `index.html` by double-clicking it will not work for submission. The page must be served by `server.js` (or any server that provides the `/api/submit` route).

---

## Deploy it

### Vercel

This project now deploys on Vercel without changing `server.js`:

- `api/index.mjs` adapts the existing Node request handler to a Vercel Web Handler function.
- `vercel.json` routes every request through that function and includes the static assets.
- The Zoho relay in `server.js` is unchanged.

Deploy with `vercel --prod`, or push these files to the Git repository connected to the Vercel project. If you set any `ZOHO_RECORDS_URL` environment variable in Vercel, keep it pointing at the same working Zoho Forms endpoint.

### Other Node hosts

The project needs a host that can run Node.js. Free/cheap options:

- **Render** — create a Web Service, point it at this repo, build command `npm install`, start command `npm start`.
- **Railway** — deploy the folder; it detects `package.json` automatically.
- **Fly.io / a VPS / cPanel with Node support** — run `node server.js` and put it behind HTTPS.

Set the `PORT` environment variable only if your host requires it; the server already reads it.

For a static-only host (GitHub Pages, plain cPanel HTML), the form will still render, but submissions will show the fallback link to the hosted Zoho form. A server is required for automatic recording.

---

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The lead form page |
| `styles.css` | All styling, including the thank-you page |
| `app.js` | Validation, payload mapping, submit handling |
| `thank-you.html` | Success page shown after submission |
| `thank-you.js` | Reads the visitor's first name from `sessionStorage` |
| `server.js` | Static file server + Zoho relay + rate limiting |
| `assets/logo.png` | Gold monogram logo (transparent PNG) used in the header and footer |
| `assets/favicon.png` | Browser tab icon, generated from the logo |
| `assets/raghuram-puranam.jpg` | Portrait used in the left-hand profile card |
| `previous-design/` | Earlier green-and-cream version, kept for reference only |

Theme tokens live at the top of `styles.css` (`--navy`, `--gold`, `--page`). Changing those four or five values re-skins the whole site, including the thank-you page.

### Layout and photo

The page is a two-column grid on desktop: a sticky navy profile card with the portrait on the left, and the white form card on the right. Below 980px it stacks (photo beside the intro text), and below 620px the photo becomes a full-width banner above the copy. Below 420px the name fields stack, the logo plate and form padding shrink, and the header email link becomes icon-only while keeping its accessible name.

To swap the portrait, replace `assets/raghuram-puranam.jpg` (a 4:5 portrait works best) and update the `width`/`height` attributes in `index.html` if the aspect ratio changes.

### Logo

`assets/logo.png` is the gold monogram on a transparent background. It sits inside a navy plate in the header (`52px`, shrinking to `42px` on phones) and a bordered plate in the footer, so the gold keeps its contrast on both the white header and the navy footer.

To use a different file, replace `assets/logo.png` and update the `width`/`height` attributes in `index.html` and `thank-you.html`. The favicon (`assets/favicon.png`) is a separate 64×64 export — regenerate it if you change the mark.

### Website link

All website links point to **https://www.raghuramrealtor.ca** (displayed as `www.raghuramrealtor.ca`). Change the `href` and the link text in `index.html` (profile card + footer) and `thank-you.html` (action button + footer) if the domain changes again.

### Contact details on the page

Phone number `437 264 6111` is deliberately **not** shown anywhere on the page. Contact points are email and the website. The visitor's own phone number is still field 02 and still maps to Zoho's `PhoneNumber`.

To add the phone back, restore it in the header, profile card, footer, and the thank-you actions.

---

## Zoho field mapping

The form sends Zoho's own field link names, which is why entries land in the right columns.

| Form field | Zoho field |
| --- | --- |
| First / last name | `Name` → `{ Name_First, Name_Last }` |
| Phone | `PhoneNumber` |
| Email | `Email` |
| Preferred contact method | `Dropdown` |
| Best time to contact | `Dropdown1` |
| What are you looking to do? | `MultipleChoice` |
| Preferred location or area | `MultipleChoice1` |
| Neighbourhood / postal code | `SingleLine` |
| Property type | `MultipleChoice2` |
| Budget (CAD) | `Currency` |
| Bedrooms | `Dropdown2` |
| Bathrooms | `Dropdown3` |
| Move timeline | `Dropdown4` |
| Additional requirements | `MultipleChoice3` |
| Anything else | `MultiLine` |
| Working with an agent? | `Dropdown5` |
| Mortgage pre-approval? | `Dropdown6` |
| How did you hear about me? | `Dropdown7` |
| Consent | `Checkbox` |

The consent value is set server-side to the exact option text used by Zoho:

> I agree to be contacted by Raghuram Puranam about my real estate inquiry using the contact details I provide.\*

---

## If you edit the Zoho form

If you add, remove, rename, or reorder fields in Zoho, update the matching pieces:

1. `app.js` → `fields`, `buildPayload()`
2. `server.js` → `STRING_FIELDS`, `ARRAY_FIELDS`, `ALLOWED_VALUES`
3. `index.html` → the visible input

If you only change the form link/perma, update `ZOHO_RECORDS_URL` in `server.js` or set the `ZOHO_RECORDS_URL` environment variable.

Keeping the option values exactly the same as Zoho matters — for example `other` (lowercase) and `just exploring` (lowercase) are intentional.

Two small differences from the PDF brief, both required by the Zoho form:

- **Bedrooms / bathrooms** offer `1, 2, 3, 4, 5+, Flexible` (Zoho's list) instead of `4+`.
- **Budget** is a single amount field, because Zoho's `Currency` field accepts one number rather than a range. Renters enter their monthly figure.

---

## Replacing the design with your own HTML

If you already have a designed HTML form, you do **not** need to use this markup. Keep these hooks:

- The `<form id="realtor-form">` element (or update the selector in `app.js`).
- Inputs with the same `name` attributes as in `index.html`.
- The submit button ID `submit-btn`, error elements `[data-error-for="..."]`, and the alert box `form-alert`.
- Link `styles.css` and `app.js` as usual.

Or send over the HTML and it can be wired without touching its visual design.

---

## Notes

- **Rate limiting:** 12 submissions per IP per 10 minutes (in-memory). Adjust `RATE_MAX` in `server.js` if needed.
- **Privacy:** no submission data is logged by the server. Only a timestamp is printed on success.
- **Spam:** Zoho's own validation still applies. If you add reCAPTCHA in Zoho, the relay will need a token from a browser session, so keep reCAPTCHA off for this setup.
- **Thank-you page:** the visitor's first name is passed through `sessionStorage`; nothing personal is put in the URL.
- **Fallback:** if the relay is unreachable, the form shows an error and a link to the hosted Zoho form so no lead is lost.

---

## Quick verification checklist

1. `npm start` and open <http://localhost:3000>.
2. Submit a test entry from the form.
3. Confirm the thank-you page appears.
4. Confirm the entry appears under **Zoho Forms → Raghuram Realtor → All Entries**.
5. Delete the test entry from Zoho when you are done.
