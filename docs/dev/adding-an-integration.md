# Adding a sauna model or integration

sauna-card talks to a sauna through an **adapter**: a small module that detects
the devices an integration exposes and maps their entities into one
model-agnostic shape the card renders. Adding support for another sauna
integration — or another heater model under an existing one — means writing (or
extending) an adapter. The card, editor and badge then work unchanged.

The registry is keyed by **integration**, not by device model. Different models
(e.g. Harvia Xenio and Fenix) are handled *inside* one adapter, not as separate
adapters. [`src/adapters/harvia.ts`](../../src/adapters/harvia.ts) is the worked
example to read alongside this guide.

## The adapter contract

Every adapter implements `SaunaAdapter` from
[`src/types.ts`](../../src/types.ts):

```ts
interface SaunaAdapter {
  readonly id: string;                       // integration id, e.g. "harvia_sauna"
  readonly stubConfig: Partial<SaunaCardConfig>;
  detect(hass): DetectedDevice[];            // devices this integration exposes (empty if absent)
  resolveEntityIds(hass, config): Record<string, string>;  // logical key → entity_id
  readState(hass, config): SaunaState | null;              // normalized state, or null
}
```

`readState` returns a `SaunaState` (also in `src/types.ts`): a flat, normalized
view — `status`, `currentTemp`, `targetTemp`, `humidity`, `remainingMinutes`,
the `switches` map, an `entities` map, and so on. Only fill the fields your
integration actually reports; the card renders whatever is present. Resolve
entities by their **domain + translation key**, not by entity-id slug — slugs
are localized and unstable.

## Steps

1. **Write the adapter.** Create `src/adapters/<integration>.ts` exporting a
   `SaunaAdapter`. Map the integration's entities into `SaunaState`.

2. **Register it.** Add it to the `registry` in
   [`src/adapter-registry.ts`](../../src/adapter-registry.ts).

3. **Make it auto-detectable.** Add the integration id to `INTEGRATION_PRIORITY`
   and its detection logic in
   [`src/utils/autodetect.ts`](../../src/utils/autodetect.ts), so the card finds
   the device with no entity IDs typed.

4. **Add any new labels.** If you surface values the catalog doesn't have yet,
   add their keys to `src/locales/en.json` (other locales back-fill from
   English). See [Adding a language](adding-a-language.md).

5. **Add contract tests with real fixtures.** Add
   `test/adapters/<integration>.test.ts`, capturing fixtures from real entity
   states (Home Assistant → Developer Tools → States) so the adapter is tested
   against what the integration actually emits.

6. **Handle model-specific config in the editor**, if the integration needs
   options the others don't.

## Verify and submit

Run `npm run test`, `npm run build`, `npm run typecheck` and `npm run lint`.
Open a pull request labelled `adapter` / `new integration`, and say which sauna
model and integration you tested against. If you can't fully test a model you
don't own, say so — a reviewed best-effort adapter plus fixtures is still a great
starting point.
