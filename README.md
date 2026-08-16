# 🎭 Who Am I?

A real-time, multiplayer forehead-guessing party game. One person hosts a room, up to
three friends join with a 4-letter code, the host picks a category, and everybody is
dealt a secret character — **visible to everyone except themselves**. Take turns asking
yes/no questions until you work out who you are.

Works across devices on the same network (or anywhere, if you deploy it): phones,
tablets, laptops.

## Run it

```bash
npm install && npm start
```

Open http://localhost:3000. The console also prints your LAN address (e.g.
`http://192.168.1.166:3000`) — that's the one to send to other players on the same Wi-Fi.

Set `PORT` to run somewhere else:

```bash
PORT=8080 npm start
```

## How a round works

1. **Host** enters a name, picks an avatar, taps *Host a room* → gets a 4-letter code.
2. **Players** join with the code (or the copied invite link, which pre-fills it). Max 4.
3. **Host** picks a category and a turn timer, then starts the game.
4. Everyone sees the same table: every player's card shows their character — except your
   own, which stays face down.
5. On your turn, ask the group a yes/no question. Then either **Pass turn** or, once you
   think you know, **I guessed it!** — you're placed in finishing order.
6. When everyone has solved (or the host hits *Reveal all*), every card flips over.
7. *Play another round* returns to the lobby with the same players.

Keyboard, on your turn: `Enter` = I guessed it, `Space` = pass.

## Categories

Celebrities · Historical Figures · Movie Characters · Superheroes & Villains · Athletes ·
Musicians · Cartoon Characters · Animals · TV Characters — 30 characters each.

Add your own by appending to `server/categories.js`; the client picks up new entries
automatically from `/api/categories`. Nothing else needs changing.

## What's inside

```
server/
  index.js       Express static host + WebSocket transport, one handler per action
  game.js        Room state machine — seating, dealing, turn order, timers, serialization
  categories.js  Category catalogue (metadata is public, character lists are not)
public/
  index.html     All four screens (home / lobby / game / results)
  styles.css     Design system: tokens, glass panels, the card table, responsive rules
  app.js         WebSocket client, renderers, timer loop, confetti & sound
```

**No build step, no framework, no database.** Rooms live in server memory and are swept
15 minutes after the last player leaves.

### Design notes

- **Your character never reaches your browser.** `serializeFor()` builds a separate view
  of the room per player and strips your own card out of it until you solve it or the
  round ends — so the secret can't be read out of devtools or the network tab.
- **The server owns the rules.** Only the host can set the category, the timer, start,
  reveal or restart; only the player whose turn it is can pass. The UI hides those
  controls, and the server rejects them regardless.
- **Reconnects are cheap.** Your seat is held by a token in `sessionStorage`; refresh or
  drop off Wi-Fi mid-game and you rejoin the same seat with the same character. Leaving
  the lobby frees the seat immediately; leaving mid-game hands the turn onward.
- **The host can leave.** Host status migrates to the next player in the room.

## Playing remotely

Everything works over the internet too — the activity rail has a text box for asking
your questions when you're not in the same room, and the reaction buttons cover
yes / no / maybe.
