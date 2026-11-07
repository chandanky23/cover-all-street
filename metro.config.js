const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Large bundled geo datasets (e.g. assets/geo/berlin-streets.geojson, ~26MB)
// must NOT be parsed into the JS bundle as a module — Metro's default
// `.json` handling inlines it as a giant JS object literal, and Hermes
// allocating 99k+ Feature objects from that blows past ~1GB and gets the
// app OOM-killed (confirmed on-device, docs/DECISIONS.md). Registering
// `.geojson` as an asset extension instead makes Metro copy it as a raw
// file and resolve it via `expo-asset`'s `Asset` API, so MapLibre's native
// GeoJSONSource can read and parse it directly without ever materializing
// it in the JS heap.
config.resolver.assetExts = [...config.resolver.assetExts, 'geojson'];

module.exports = config;
