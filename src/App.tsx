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

export function App() {
  const ingested = useStore((s) => s.ingested);
  const activeTab = useStore((s) => s.activeTab);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const selectedId = useStore((s) => s.selectedId);

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
        </div>
      </div>
      {showInspector && <Inspector />}
      <Lightbox />
      <Toasts />
    </div>
  );
}
