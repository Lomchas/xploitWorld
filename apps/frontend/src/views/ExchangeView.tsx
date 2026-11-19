import { ExchangeDesk } from "../components/Exchange/ExchangeDesk";
import { WalletView } from "./WalletView";
export function ExchangeView() {
  return (
    <WalletView
      renderDesk={(identity, onWallet) => (
        <ExchangeDesk identity={identity} onWallet={onWallet} />
      )}
    />
  );
}
