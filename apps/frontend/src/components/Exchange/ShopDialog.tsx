import { useEffect, useRef, type ReactNode } from "react";
import { useLocale } from "../../lib/locale";

export function ShopDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="exchange-dialog"
      aria-labelledby="exchange-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="exchange-dialog-title">{title}</h2>
        <button type="button" onClick={onClose} aria-label={t("Cerrar")}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function ProductArt({ name }: { name: string }) {
  return (
    <img
      className="product-art"
      src={import.meta.env.BASE_URL + "exchange/" + name + ".webp"}
      alt=""
      width={440}
      height={440}
      loading="lazy"
    />
  );
}
