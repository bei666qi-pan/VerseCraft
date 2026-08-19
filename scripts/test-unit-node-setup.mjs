import Module from "node:module";

// `server-only` is a Next.js compile-time boundary marker whose default Node
// entry intentionally throws. Unit tests execute confirmed server modules in
// plain Node, so treat only this marker as a no-op while preserving every real
// dependency and assertion.
const originalLoad = Module._load;
Module._load = function verseCraftUnitModuleLoad(request, parent, isMain) {
  if (request === "server-only") return Object.freeze({});
  return originalLoad.call(this, request, parent, isMain);
};
