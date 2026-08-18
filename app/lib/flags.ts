// Build-time feature flags.
//
// NEXT_PUBLIC_ values are inlined by the compiler as a textual substitution of
// the literal `process.env.NEXT_PUBLIC_BUNDLES_LIVE` expression, so it has to
// be read exactly once, exactly like this — a computed lookup would come back
// undefined in the browser bundle.
const raw = process.env.NEXT_PUBLIC_BUNDLES_LIVE;

/** Market Bundles ship dark. Unset, empty, or anything else means off. */
export const BUNDLES_LIVE = raw === "true" || raw === "1";
