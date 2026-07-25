"use client";

import * as Dialog from "@radix-ui/react-dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="dialog-copy" asChild>
            <div>{description}</div>
          </Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="button button-secondary" disabled={pending}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              className="button button-primary"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? "Working…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
