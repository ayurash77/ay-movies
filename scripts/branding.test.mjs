import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('uses AY Movies project branding', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
  const rootRoute = await readFile('src/routes/__root.tsx', 'utf8')

  assert.equal(packageJson.name, 'ay-movies')
  assert.match(rootRoute, /AY Movies/)
  assert.doesNotMatch(rootRoute, /MovieNest/)
})
