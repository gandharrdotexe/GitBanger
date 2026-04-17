# GitBanger

GitBanger is a VS Code extension that plays hip-hop producer tags when common developer actions happen.

## Features

- Git actions
  - `git push`
  - `git commit`
  - `git merge`
- Build results
  - success
  - failure
- Package install detection
  - `npm install`
  - `yarn install`
  - `pnpm install`
- Generic terminal fallback for anything else
- Status bar mute toggle with persisted state
- Configurable cooldown and volume

## Audio assets

The bundled tags live in [`audio/`](./audio) and are wired by filename.

## Development

```bash
npm install
npm run build
```

Then press `F5` in VS Code to launch the extension host.
