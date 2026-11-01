import { TopBar } from "./components/TopBar/TopBar";
import { Terminal } from "./components/Terminal/Terminal";

function App(): JSX.Element {
  const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3000";

  return (
    <div style={{ height: "100vh", margin: 0, backgroundColor: "#0c0c0b" }}>
      <TopBar wsUrl={wsUrl} />
      <Terminal wsUrl={wsUrl} />
    </div>
  );
}

export default App;
