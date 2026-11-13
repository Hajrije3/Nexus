# ADR-0001: Imperative DOM updates during window gestures

- Status: Accepted
- Date: 2026-11-13

## Context

Dragging and resizing a window produces 60–240 pointer events per second.
The window manager's state lives in a Zustand store that React renders from.

## Options

1. **Write to the store on every pointer move.** Simplest; geometry is always
   current. Every move re-renders the frame (cheap) and risks re-rendering app
   content (expensive for Monaco/terminal) unless every boundary is perfectly
   memoised. Persistence subscribers fire per frame.
2. **Write to the store once per animation frame.** Halves the work on high
   refresh-rate input but keeps all the downsides of (1).
3. **Mutate the DOM node imperatively during the gesture, commit on release.**
   No renders mid-gesture. Store is stale for the duration of the gesture.

## Decision

Option 3. Gesture hooks (`useWindowDrag`, `useWindowResize`) hold the start
rect in a ref, compute the next rect with the same pure functions the store
uses (`geometry.ts`), apply it to the frame's `style` inside
`requestAnimationFrame`, and call the store action once on `pointerup`.

Snap previews need live feedback, so the hook writes `snapPreview` to the
store only when the computed zone *changes* (a handful of writes per gesture).

## Consequences

- Smooth gestures regardless of app weight.
- Anything that needs live geometry mid-gesture must subscribe to the gesture
  hook, not the store. Currently nothing does.
- The rendered style and the store must agree after commit; because both use
  `geometry.ts`, they do.
