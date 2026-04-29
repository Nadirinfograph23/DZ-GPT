// V3 Execution Agent — bundles generated apps into a downloadable artifact
// and records a "deployment intent" the user can act on. Does NOT actually
// deploy to a third-party host (that requires the user's own infra and
// long-running execution incompatible with Vercel functions).

import { storeArtifact, getArtifactURL } from '../webapp-generator.js'

export const ExecutionAgent = {
  name: 'execution',
  description: 'Packages generated apps into a downloadable artifact and produces deploy instructions',

  async run({ bus, ctx = {} }) {
    bus.emit('agent.start', { agent: 'execution' })
    if (!ctx.app || !ctx.app.files) {
      bus.emit('agent.error', { agent: 'execution', error: 'no app to package' })
      return { ok: false, error: 'no app provided' }
    }
    const id = await storeArtifact(ctx.app)
    const downloadPath = getArtifactURL(id)
    bus.emit('agent.tool', { agent: 'execution', tool: 'storeArtifact', artifactId: id })

    const deployInstructions = [
      '1. Download the zip from the URL below.',
      '2. Unzip and run `npm install`.',
      '3. Run `npm run dev` for local dev or `npm run start` for production.',
      '4. To deploy to Vercel: push the repo to GitHub then import in vercel.com → New Project.',
      '5. To deploy elsewhere (Heroku/AWS/DigitalOcean): the package.json scripts work on any Node 20+ host.',
    ]

    bus.emit('agent.result', { agent: 'execution', artifactId: id, downloadPath })
    return {
      ok: true,
      artifactId: id,
      downloadPath,
      template: ctx.app.template,
      fileCount: Object.keys(ctx.app.files).length,
      deployInstructions,
    }
  },
}
