// Rough user-agent → browser + OS of a signed-in session (device list), web + mobile.

export type DeviceInfo = { browser: string; os: string; mobile: boolean };

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/CocoaRest|PostmanRuntime|curl\//, "API client"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

export function parseUserAgent(ua?: string | null): DeviceInfo {
  const value = ua ?? "";
  const match = (list: [RegExp, string][]) =>
    list.find(([re]) => re.test(value))?.[1] ?? "";
  return {
    browser: match(BROWSERS),
    os: match(SYSTEMS),
    mobile: /Mobi|Android|iPhone|iPad/.test(value),
  };
}
