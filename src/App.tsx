import { useEffect } from "react";
import { useStore } from "./state/store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Gallery } from "./components/Gallery";
import { Inspector } from "./components/Inspector";
import { Lightbox } from "./components/Lightbox";
import { Welcome } from "./components/Welcome";
import { Toasts } from "./components/Toasts";
import { ThisDay } from "./components/tabs/ThisDay";
import { Attributes } from "./components/tabs/Attributes";
import { Duplicates } from "./components/tabs/Duplicates";
import { ThemesPlaces } from "./components/tabs/ThemesPlaces";
import { Settings } from "./components/tabs/Settings";

export function App() {
  const ingested = useStore((s) => s.ingested);
  const activeTab = useStore((s) => s.activeTab);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const selectedId = useStore((s) => s.selectedId);
  const initBackup = useStore((s) => s.initBackup);
  const maybeAutoBackup = useStore((s) => s.maybeAutoBackup);
  const initAppearance = useStore((s) => s.initAppearance);

  // Apply saved appearance (theme etc.) as early as possible.
  useEffect(() => initAppearance(), [initAppearance]);

  // Load backup settings once, then poll the schedule. Auto-backup only fires
  // when it's actually due and a destination folder was previously chosen.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    void initBackup().then(() => {
      void maybeAutoBackup();
      timer = setInterval(() => void maybeAutoBackup(), 15 * 60 * 1000);
    });
    return () => clearInterval(timer);
  }, [initBackup, maybeAutoBackup]);

  if (!ingested) return <Welcome />;

  const showInspector = inspectorOpen && selectedId;

  return (
    <div className={`app ${showInspector ? "with-inspector" : ""}`}>
      <Sidebar />
      <div className="main">
        <TopBar />
        <div className="content">
          {activeTab === "library" && <Gallery />}
          {activeTab === "thisDay" && <ThisDay />}
          {activeTab === "attributes" && <Attributes />}
          {activeTab === "duplicates" && <Duplicates />}
          {(activeTab === "places" || activeTab === "themes") && <ThemesPlaces />}
          {activeTab === "settings" && <Settings />}
        </div>
      </div>
      {showInspector && <Inspector />}
      <Lightbox />
      <Toasts />
    </div>
  );
}
