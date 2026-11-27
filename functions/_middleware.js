// Legacy hostnames merged into this workbench: permanent redirect to the matching tab.
const LEGACY = { "quant.mohammed-km.in": "https://forecast.mohammed-km.in/#fat-tails" };
export async function onRequest({ request, next }) {
  const target = LEGACY[new URL(request.url).hostname];
  return target ? Response.redirect(target, 308) : next();
}
