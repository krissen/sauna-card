// Dispatch Home Assistant's standard "more-info" dialog for an entity. The
// event must bubble and cross shadow-DOM boundaries (composed) to reach HA's
// dialog manager from inside a card's shadow root. Shared by the card and the
// badge so the event shape is defined in exactly one place.
export function fireMoreInfo(node: HTMLElement, entityId: string): void {
  node.dispatchEvent(
    new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }),
  );
}
