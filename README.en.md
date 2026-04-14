<p align="center">
  <img src="./public/logo.svg" width="92" alt="VerseCraft logo" />
</p>

<h1 align="center">VerseCraft</h1>

<p align="center">
  <strong>An AI-powered interactive fiction game platform</strong>
</p>

<p align="center">
  VerseCraft does not put a novel inside a chat box.<br>
  It gives the <strong>world, rules, choices, and consequences</strong> to AI and lets them run in front of the player.
</p>

<p align="center">
  <a href="https://versecraft.cn"><strong>Live demo: versecraft.cn</strong></a> ·
  <a href="./README.md">简体中文</a>
</p>

<p align="center">
  <a href="#what-is-versecraft">What is VerseCraft</a> ·
  <a href="#live-demo">Live Demo</a> ·
  <a href="#current-example-world">Current Example</a> ·
  <a href="#30-second-gameplay">Gameplay</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#for-developers">For Developers</a>
</p>

> **In one sentence:** VerseCraft aims to be more than an AI novel. It is a game platform where AI can run, continue, and expand interactive fiction worlds.

## What is VerseCraft

VerseCraft is an AI platform prototype for interactive storytelling.

Here, AI is not only asked to continue a paragraph of prose. It is responsible for making a world actually run:

- It receives the player's natural-language action.
- It understands the current scene, world rules, character state, and time progression.
- It decides what consequences the action should trigger.
- It turns those consequences into new narration, new choices, and new pressure.

In other words, **the player is not simply reading a novel. They are stepping into an interactive novel lit up by AI in real time.**

## Why it is different

- **It aims to be a platform, not a single story page**: the same interactive narrative foundation can support mystery, campus drama, science fiction, apocalypse, realistic fiction, history, fantasy, and more.
- **AI acts as the story runtime**: it is not a chatbot companion, but the engine that advances plots, executes rules, and creates consequences.
- **Interaction is natural-language action, not only multiple choice**: players can directly say what they want to do, as if they were really there.
- **Worldbuilding is designed to grow**: every new world can define its own rules, characters, checks, and narrative rhythm.
- **It is not a clone of traditional text adventures**: it is closer to a combination of interactive fiction, rule systems, and an AI narrative engine.

If many AI products are building smarter chat, VerseCraft is trying to build **a story world that feels alive**.

## Live Demo

Live demo: [versecraft.cn](https://versecraft.cn)

## Current Example World

VerseCraft currently provides one playable starting world to validate the platform:

### Prologue · Dark Moon

You enter an interactive narrative scene continued by an AI story runner.

It is not VerseCraft's genre boundary. It is the first content sample:

- It validates how natural-language actions are received by AI.
- It validates how world state, character state, and time progression work together.
- It validates whether one platform layer can continuously incubate different interactive stories.
- Future worlds can have completely different genres, rhythms, and play goals.

In other words, "Prologue · Dark Moon" is the first door, not the only material type VerseCraft is built for.

## 30-Second Gameplay

1. Create a character, assign attributes, and choose your starting tendency.
2. Enter the current world and read the scene described by AI.
3. Type a natural-language action, for example:

> I stay quiet and move forward along the wall.<br>
> I knock three times, then step back immediately.<br>
> I do not go in yet. I point the flashlight toward the end of the corridor first.

4. AI combines the world rules, character attributes, and time changes to produce immediate consequences.
5. You keep acting, and the story keeps branching until you survive, fail, or glimpse part of the truth.

## What it feels like

- **Pressure**: danger is not only written in the background. It can catch up with you in real time.
- **Agency**: your input is not decorative. It can change where the story goes.
- **Uncertainty**: the same action can produce different results at different times or in different states.
- **Immersion**: it feels more like living through a novel than watching one from the outside.

## Who it is for

- Players who enjoy interactive fiction, branching narratives, role-playing, and text adventures.
- Players who want choices to change outcomes instead of only reading fixed plots.
- People interested in AI-native content and whether a novel platform can be redefined.
- Anyone who wants to try a single-player, browser-based narrative system driven by AI.

## Quick Start

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local`, then fill in the required configuration. By default the development server starts at `http://localhost:666`; enter the character creation flow to begin playing.

## Where the platform is going

VerseCraft's ambition is not only to finish one example world.

The project is trying to validate whether:

- AI can become the platform layer for interactive fiction.
- One repository can continuously incubate multiple playable worlds.
- Worldbuilding, rule systems, state progression, and narrative generation can become extensible content infrastructure.

What you see now is the first door, not the final floor.

## For Developers

<details>
<summary><b>Expand developer notes</b></summary>

### Project Positioning

VerseCraft is a single-player Chinese interactive narrative project that runs in the browser. It currently uses "Prologue · Dark Moon" as the first demo world and builds a general platform prototype around AI-driven narration, rule checks, world knowledge retrieval, and client-side persistence.

### Tech Stack

- Next.js 16 + React 19
- Tailwind CSS v4
- Zustand 5
- PostgreSQL + Drizzle
- IndexedDB (`idb-keyval`) for client-side persistence

### Common Local Development Commands

```bash
pnpm dev
pnpm build
pnpm test:unit
pnpm test:e2e:chat
pnpm run ship -- "feat: your message"
```

### Environment Variables

Copy `.env.example` to `.env.local`, then fill in the template. Common required values include:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `ADMIN_PASSWORD`
- `ALTCHA_HMAC_KEY`
- `AI_GATEWAY_BASE_URL`
- `AI_GATEWAY_API_KEY`
- `AI_MODEL_MAIN`
- `AI_MODEL_CONTROL`
- `AI_MODEL_ENHANCE`
- `AI_MODEL_REASONER`

For more details, see:

- `docs/environment.md`
- `docs/ai-architecture.md`
- `docs/local-development.md`
- `docs/deployment-coolify.md`

### Project Structure

```text
src/
├── app/           # Pages and API routes
├── components/    # Shared UI components
├── features/      # Gameplay and streaming interaction logic
├── lib/           # Config, AI, world knowledge, and server capabilities
└── store/         # Game state
```

</details>

## License

[MIT](./LICENSE)
