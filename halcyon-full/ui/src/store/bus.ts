type FocusEvent = {
  id: string
  type: string
}

const bus = new EventTarget()

export const focus = (e: FocusEvent) => {
  bus.dispatchEvent(new CustomEvent('focus', { detail: e }))
}

export const onFocus = (fn: (e: FocusEvent) => void) => {
  const h = (ev: Event) => {
    fn((ev as CustomEvent).detail)
  }
  bus.addEventListener('focus', h)
  return () => {
    bus.removeEventListener('focus', h)
  }
}
