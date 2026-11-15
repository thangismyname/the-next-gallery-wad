const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Product Sans is proprietary and git-ignored (like on the web) — a fresh clone or an
// EAS build doesn't have the files. Resolve a missing font file to an empty module so
// the bundle still builds; `src/lib/fonts.ts` skips it and Text falls back to the
// system font.
const FONT_FILE = /assets\/fonts\/[^/]+\.(otf|ttf)$/;
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (FONT_FILE.test(moduleName) && moduleName.startsWith(".")) {
    const file = path.resolve(path.dirname(context.originModulePath), moduleName);
    if (!fs.existsSync(file)) return { type: "empty" };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
