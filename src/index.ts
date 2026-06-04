// Entry point: registers custom elements and advertises the card to Home
// Assistant's Lovelace picker (and, later, the badge picker).
import "./sauna-card";

window.customCards = window.customCards || [];
window.customCards.push({
  // Lovelace card type as used in YAML: the "custom:" prefix is the current
  // convention (matches HA's getEntitySuggestion example and modern cards).
  type: "custom:sauna-card",
  name: "Sauna Card",
  preview: true,
  description: "Show and control Harvia sauna heaters (Xenio, Fenix).",
  documentationURL: "https://github.com/krissen/sauna-card",
  // HA 2026.6 card-picker suggestions (getEntitySuggestion) are added in
  // increment I8, once autodetect can recognise Harvia entities.
});
