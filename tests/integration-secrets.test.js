import assert from 'node:assert/strict'
import {
  getIntegrationSecret,
  getIntegrationSecretStatus,
  requireIntegrationSecret,
} from '../lib/integration-secrets.js'

const originalGithub = process.env.GITHUB_TOKEN
const originalVercel = process.env.VERCEL_TOKEN

try {
  process.env.GITHUB_TOKEN = 'github-test-secret'
  process.env.VERCEL_TOKEN = 'vercel-test-secret'

  assert.equal(getIntegrationSecret('github'), 'github-test-secret')
  assert.equal(getIntegrationSecret('vercel'), 'vercel-test-secret')
  assert.deepEqual(getIntegrationSecretStatus(), {
    github: { configured: true },
    vercel: { configured: true },
  })
  assert.equal(requireIntegrationSecret('github'), 'github-test-secret')
  assert.equal(requireIntegrationSecret('vercel'), 'vercel-test-secret')

  const status = JSON.stringify(getIntegrationSecretStatus())
  assert.equal(status.includes('test-secret'), false)

  delete process.env.GITHUB_TOKEN
  assert.deepEqual(getIntegrationSecretStatus(), {
    github: { configured: false },
    vercel: { configured: true },
  })
  assert.throws(() => requireIntegrationSecret('github'), /GITHUB_TOKEN/)

  console.log('✅ Integration secret configuration tests passed')
} finally {
  if (originalGithub === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = originalGithub
  if (originalVercel === undefined) delete process.env.VERCEL_TOKEN
  else process.env.VERCEL_TOKEN = originalVercel
}