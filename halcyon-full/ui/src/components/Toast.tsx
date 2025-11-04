import React, { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  duration?: number
  onClose: () => void
}

export const Toast: React.FC<ToastProps> = ({ message, duration = 3000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className="fixed top-4 right-4 bg-teal-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
      {message}
    </div>
  )
}

// Simple toast manager
let toastQueue: string[] = []
let toastListeners: Array<(message: string) => void> = []

export const showToast = (message: string) => {
  toastQueue.push(message)
  toastListeners.forEach(fn => fn(message))
}

export const subscribeToToast = (fn: (message: string) => void) => {
  toastListeners.push(fn)
  return () => {
    toastListeners = toastListeners.filter(f => f !== fn)
  }
}
