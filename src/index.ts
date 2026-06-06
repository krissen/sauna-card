// Entry point: registers custom elements and advertises the card to Home
// Assistant's Lovelace picker (and, later, the badge picker).
import "./sauna-card";
import "./sauna-card-editor";
import "./sauna-badge";
import "./sauna-badge-editor";
import type { Hass } from "./types";
import { suggestEntity } from "./suggestion";

const customCards = (window.customCards ??= []);
customCards.push({
  // Per HA docs, window.customCards uses the bare custom element tag; Home
  // Assistant prepends "custom:" when the card is referenced in dashboard YAML.
  // https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/
  type: "sauna-card",
  name: "Sauna Card",
  preview: true,
  description: "Show and control Harvia sauna heaters (Xenio, Fenix).",
  documentationURL: "https://github.com/krissen/sauna-card",
  // HA 2026.6 card-picker suggestions: offer the card when any Harvia entity
  // is picked (per-entity hook), so it surfaces across the whole device.
  getEntitySuggestion: (hass: Hass, entityId: string) =>
    suggestEntity(hass, entityId),
});

const customBadges = (window.customBadges ??= []);
customBadges.push({
  // Like customCards, this uses the bare custom element tag. Badges have no
  // getEntitySuggestion hook (that is card-only in HA 2026.6).
  type: "sauna-badge",
  name: "Sauna Badge",
  preview: true,
  description: "Compact status badge for Harvia sauna heaters (Xenio, Fenix).",
  documentationURL: "https://github.com/krissen/sauna-card",
});
