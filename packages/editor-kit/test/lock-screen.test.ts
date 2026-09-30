import { afterEach, expect, test } from 'vitest'
import { LOCKED_CLASS, showLockScreen } from '../src/lock-screen'

afterEach(() => {
  document.body.innerHTML = ''
})

function submit(password: string): void {
  const input = document.querySelector<HTMLInputElement>('.trevixal-lock-screen input')
  const form = document.querySelector<HTMLFormElement>('.trevixal-lock-screen form')
  if (!input || !form) throw new Error('expected the lock screen')
  input.value = password
  form.dispatchEvent(new Event('submit', { cancelable: true }))
}

test('hides the editor until the password is typed, and not a wrong one', async () => {
  const root = document.createElement('div')
  document.body.append(root)
  let isUnlocked = false
  const unlocked = showLockScreen(root, (candidate) => candidate === 'hunter2').then(() => {
    isUnlocked = true
  })
  expect(root.inert).toBe(true)
  expect(root.classList.contains(LOCKED_CLASS)).toBe(true)

  submit('wrong')
  await Promise.resolve()
  expect(isUnlocked).toBe(false)
  expect(document.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(false)

  submit('hunter2')
  await unlocked
  expect(root.inert).toBe(false)
  expect(root.classList.contains(LOCKED_CLASS)).toBe(false)
  expect(document.querySelector('.trevixal-lock-screen')).toBeNull()
})
