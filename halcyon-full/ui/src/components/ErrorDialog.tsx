import React from 'react'
import { Modal } from './Modal'

interface ErrorDialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
}

export const ErrorDialog: React.FC<ErrorDialogProps> = ({
  isOpen,
  onClose,
  title = 'Error',
  message,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-red-400">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </Modal>
  )
}
