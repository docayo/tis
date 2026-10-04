Hello. You are taking over an existing project called TIS EMIS — The
Ideal Schools Operational Portal & Databank.

Before doing anything else, read these three documents in order:

CURRENT STATE — read this first:
https://raw.githubusercontent.com/docayo/tis/main/HANDOVER.md
(If that URL fails, use: https://tis-tan.vercel.app/handover)

REFERENCE — schemas, section map, methods, rules, conventions:
https://raw.githubusercontent.com/docayo/tis/main/REFERENCE.md

HISTORY — session-by-session log of how we got here:
https://raw.githubusercontent.com/docayo/tis/main/HISTORY.md

Read HANDOVER.md first — it is the current state. Consult REFERENCE.md
for schemas and rules. Read HISTORY.md only if you need to understand
how the current state came to be. Never confuse history with current
state.

Confirm when you have read all three. Then ask me:

"Has anything changed since the date at the top of HANDOVER.md?"

Wait for my answer before proposing or making any change.

Rules for working with me (all from HANDOVER.md Part 8 and
REFERENCE.md Part 6):

Always give full-section replacements, not inline patches.

Use the FILE / START / END / NEXT header before every delivery.

Never truncate a code block. If a block is too long, split it
clearly as Part 1 of N / Part 2 of N with explicit "paste together"
instructions.

Never say "find this line and change it."

Always ask for the current file before modifying it.

Do not assume anything about the state of the project that the
handover does not explicitly confirm.

Deliver one change at a time. Test between each.

Test in incognito with ?v=<Date.now()> before diagnosing any error.

Ask me to confirm anything you are not sure about. Do not guess.

When a session ends, update HANDOVER.md and append one entry to
HISTORY.md.

If any of the three raw URLs is unreachable, tell me and I will paste
the file contents directly.
---

## How to use this file

Three ways, in order of reliability:

1. **Keep a browser bookmark** to
   `https://raw.githubusercontent.com/docayo/tis/main/PROMPT.md`
   Open it, copy the block between the dashes, paste into the new chat.

2. **Keep a draft email** to yourself with the prompt text. Whenever
   you start a new AI conversation, open the draft and copy.

3. **Print one copy** and keep it near your computer. Old-fashioned
   but zero dependency.

## When to update this file

Update `PROMPT.md` if and only if:

- One of the three handover files is renamed.
- A new rule is added to REFERENCE.md Part 6 that the AI must know
  before starting.
- The raw URL host changes (e.g. the project moves to `www.tis.ng`).

Never update this file just to change wording. The prompt is stable
by design.

## If the AI cannot reach the raw URLs

Some AI environments block external fetches. If that happens:

1. Open `HANDOVER.md` in your browser (GitHub or the live page).
2. Copy the entire content.
3. Paste it into the first message, right after the prompt above,
   with a note: *"The raw URL did not work for you. Here is the
   content of HANDOVER.md directly."*
4. Then paste `REFERENCE.md` and `HISTORY.md` in the same message if
   they fit, or in a follow-up message labelled clearly.

**Do not skip the handover.** An AI that starts without it will
propose changes that have already been made, or break rules it did
not know existed.

---

**End of `PROMPT.md`.**
