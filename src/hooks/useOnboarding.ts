import { useEffect, useState } from 'react'

const STORAGE_KEY = 'bias_room_onboarding_v1'

export function useOnboarding() {
  const [isOpen, setIsOpen] = useState(false)

  // Auto-open on first visit (after auth resolves)
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setIsOpen(true)
    }
  }, [])

  function open() {
    setIsOpen(true)
  }

  function close() {
    localStorage.setItem(STORAGE_KEY, '1')
    setIsOpen(false)
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY)
  }

  return { isOpen, open, close, reset }
}
