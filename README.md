# Hẻm Vô Tận

A PS1-style delivery game set on the real street network of District 3, Ho Chi Minh City. You are a new delivery rider and learn to read Saigon alley addresses such as `304/28/8 Lê Văn Sỹ`.

**Play:** https://kvsx0810.github.io/A1---DMS4/

## How to play

- Arrow keys or WASD to ride, **E** to talk or interact, **P** for the phone, **M** for the map, **H** for the horn.
- Take an order on the phone, follow the yellow beam to the shop, then to the mouth of the right alley.
- Inside the alley, read the house numbers yourself. Walking in from the alley mouth, even numbers are on the right and odd numbers are on the left.
- A branch alley takes the number of the house at its mouth. `284/5/6` means: alley 284, then alley 5 inside it, then house 6.

## How it is built

- One static page, no backend. It runs on GitHub Pages as is.
- Three.js r128 drives the low-resolution PS1 look: a 300-pixel-high framebuffer, dithered 15-bit colour and nearest-filtered textures.
- Roads come from OpenStreetMap. Each way is classed as a street or an alley, and alley levels are worked out from how ways connect.
- House numbers along main streets are calibrated on real named alleys such as "Hẻm 304 Lê Văn Sỹ".
- Progress is saved in the browser's `localStorage`.
- Customer chat uses Claude when the page is opened as a Claude artifact, and Gemini through the Worker in `worker/` everywhere else. With neither it falls back to written lines. "Ask the way" always answers from the game's own map.

## Credits

- Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).
- Photo textures: Poly Haven (CC0).
- Sound effects: Epidemic Sound, used under the author's Epidemic Sound subscription.
- 3D engine: three.js (MIT).
- Fonts: Be Vietnam Pro, Barlow Condensed and IBM Plex Mono (SIL Open Font License), from Google Fonts.

## Chat backend (optional)

Static hosting has no Claude access, so customer chat on GitHub Pages goes through a small Cloudflare Worker in `worker/`. The Worker calls the Gemini API, keeps the key secret, accepts requests only from the game's origin, and limits each visitor to 12 messages a minute.

```
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

Put the deployed URL plus `/chat` into `CHAT_ENDPOINT` in `index.html`. If `CHAT_ENDPOINT` is left empty, customers reply with written lines.
