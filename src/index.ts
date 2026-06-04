// Entry point: registers custom elements and advertises the card to Home
// Assistant's Lovelace picker (and, later, the badge picker).
import "./sauna-card";

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
  // HA 2026.6 card-picker suggestions (getEntitySuggestion) are added in
  // increment I8, once autodetect can recognise Harvia entities.
});
