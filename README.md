# Ishraque Bin Khalil — Portfolio

Personal portfolio site. Plain HTML/CSS/JS, no build step, no dependencies — free to host on GitHub Pages.

## Before you publish

Two placeholders need your real GitHub username, in two files:

- `index.html` — search for `IBK015` (appears twice: hero social links and contact section)

Replace `https://github.com/IBK015` with your actual GitHub profile URL.

## Deploying to GitHub Pages

1. **Create the repo.** On GitHub, click **New repository**. Name it whatever you like — for a personal profile page specifically, naming it `YOUR_USERNAME.github.io` makes it live at the root domain (`https://YOUR_USERNAME.github.io`) instead of a `/repo-name/` subpath. Any other name still works, just with that subpath.
2. **Upload these files.** Either:
   - Drag the whole contents of this folder into the GitHub web UI ("Add file → Upload files"), or
   - Use git from your machine:
     ```bash
     cd ishraque-portfolio
     git init
     git add .
     git commit -m "Initial portfolio site"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
     git push -u origin main
     ```
3. **Enable Pages.** In the repo, go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. Wait a minute or two, then the site will be live at the URL GitHub shows on that same Pages settings screen.

## Using a custom domain (optional)

If you own a domain (e.g. `ishraquekhalil.com`):

1. Add a file named `CNAME` (no extension) to the root of this repo containing just your domain, e.g.:
   ```
   ishraquekhalil.com
   ```
2. At your domain registrar, add a `CNAME` record pointing to `YOUR_USERNAME.github.io`, or the four GitHub Pages `A` records if pointing the apex domain — GitHub's Pages settings screen shows the exact records once you type your domain in there.

## Updating content later

Everything lives in `index.html` (copy/content), `css/style.css` (styling), and `js/script.js` (the mobile nav toggle + footer year). No build tools, no npm install — edit and push.

## Structure

```
ishraque-portfolio/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── script.js
└── README.md
```
