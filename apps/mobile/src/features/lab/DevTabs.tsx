import { ChartColumn, FlaskConical, PlayCircle } from "lucide-react-native";

import { AppTabs } from "@/features/navigation/AppTabs";

/**
 * Developer workspace (`/dev`, web `/dev/lab` + `DevLayout`): approved Developers + admins (view only) —
 * the API `/api/lab` is `requireDeveloper` anyway. The app's tab bar (`AppTabs`): Experiments (list by
 * step / run order → detail pushed inside the tab) · **Overview (middle)** · Run (tier 2 placeholder:
 * running benchmarks / tests from the app). The switch to the Admin workspace (admins) is a button on the
 * Overview page. `backBehavior="none"` → back leaves the workspace.
 */
export function DevTabs() {
  return (
    <AppTabs
      backBehavior="none"
      tabs={[
        { name: "experiments", labelKey: "dev.nav.experiments", sf: "flask", md: "science", icon: FlaskConical },
        { name: "index", labelKey: "lab.overview.tab", sf: "chart.bar", md: "bar_chart", icon: ChartColumn },
        { name: "run", labelKey: "dev.nav.run", sf: "play.circle", md: "play_circle", icon: PlayCircle },
      ]}
    />
  );
}
