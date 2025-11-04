import React from 'react'
import { Modal } from './Modal'

interface AlertDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  buttonText?: string
  variant?: 'error' | 'info' | 'success'
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  onClose,
  title,
  message,
  buttonText = 'OK',
  variant = 'info'
}) => {
  const variantColors = {
    error: 'bg-red-600 hover:bg-red-700',
    info: 'bg-teal-600 hover:bg-teal-700',
    success: 'bg-green-600 hover:bg-green-700'
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className={`text-white/80 ${variant === 'error' ? 'text-red-200' : ''}`}>{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded text-white text-sm ${variantColors[variant]}`}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
