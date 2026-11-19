import { CoinIcon } from "../CoinIcon";
import { NavLink } from "react-router-dom";
import { formatPvpBtc } from "@null-protocol/shared";

const links = [
  { path: "/historia", icon: ">_", label: "Historia" },
  { path: "/pvp", icon: "⚔", label: "PvP" },
  { path: "/dispositivo", icon: "▣", label: "Dispositivo" },
  { path: "/servidores", icon: "▤", label: "Servidores" },
  { path: "/exchange", icon: "⇄", label: "Exchange" },
  { path: "/config", icon: "⚙", label: "Ajustes" },
];

export function Navigation({ balance }: { balance: string | null }) {
  return (
    <nav className="station-nav" aria-label="Navegación principal">
      {links.map((link) => (
        <NavLink
          key={link.path}
          to={link.path}
          className={({ isActive }) =>
            "station-nav-link" + (isActive ? " active" : "")
          }
        >
          <span className="station-nav-icon" aria-hidden="true">
            {link.icon}
          </span>
          {link.label}
        </NavLink>
      ))}
      <NavLink
        className="station-wallet-link"
        to="/exchange"
        aria-label="Abrir billetera"
      >
        <CoinIcon /> {balance === null ? "—" : formatPvpBtc(balance)} BTC
      </NavLink>
    </nav>
  );
}
