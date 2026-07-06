---
name: react-grid-layout v1 vs v2 API
description: Why the dashboard grid pins react-grid-layout to v1, not the newer v2
---

Use `react-grid-layout@^1.5` (with `@types/react-grid-layout@^1.3` from DefinitelyTyped), NOT v2.x.

**Why:** v2 (e.g. 2.2.3) is a ground-up rewrite with an incompatible API and ships its own types. It has **no `WidthProvider`**, replaces `isDraggable`/`isResizable`/`draggableHandle`/`compactType` with `dragConfig`/`resizeConfig`/`compactor`, requires an explicit `width` prop, and its `Layout` type is `readonly LayoutItem[]` (the item is `LayoutItem`) — so `layouts={{lg:[{i,x,y,w,h}]}}` typed as `Layout[]` fails to compile. `@types/react-grid-layout@2.1.0` is a near-empty stub.

**How to apply:** the classic, widely-documented API (`WidthProvider(Responsive)`, `layouts`/`breakpoints`/`cols`, `isDraggable`, `draggableHandle`, `onDragStop`/`onResizeStop`, `compactType="vertical"`, `Layout` = the item object) only exists on v1. If a snippet uses `WidthProvider`, it assumes v1 — pin v1. The RGL v1 `react-grid-layout/css/styles.css` is self-contained (includes `.react-resizable-handle` styles), so importing react-resizable's CSS separately is unnecessary.
