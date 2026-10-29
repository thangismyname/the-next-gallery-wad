import { LandingHeader } from "./components/LandingHeader";
import { Hero } from "./components/Hero";
import { AiShowcase } from "./components/AiShowcase";
import { CapabilitiesList } from "./components/CapabilitiesList";
import { Workflow } from "./components/Workflow";
import { AppDownload } from "./components/AppDownload";
import { ClosingStatement } from "./components/ClosingStatement";
import { LandingFooter } from "./components/LandingFooter";
import { ScrollProgress } from "@/components/motion/effects";

export default function LandingView() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <ScrollProgress />
      <LandingHeader />
      <main>
        <Hero />
        <AiShowcase />
        <CapabilitiesList />
        <Workflow />
        <AppDownload />
        <ClosingStatement />
        <LandingFooter />
      </main>
    </div>
  );
}
