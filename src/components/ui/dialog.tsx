import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useId } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const descriptionId = useId();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`dialog-content ${className}`}
          aria-describedby={description ? descriptionId : undefined}
          onOpenAutoFocus={() => {
            previousFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previousFocus.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="dialog-title">
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description id={descriptionId}>
              {description}
            </DialogPrimitive.Description>
          )}
          <DialogPrimitive.Close className="dialog-close" aria-label="Fechar">
            <X size={22} />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
