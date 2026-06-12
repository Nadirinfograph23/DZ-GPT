/**
 * agents/sportsAgent.js
 * ══════════════════════════════════════════════════════════
 * وكيل الرياضة العامة — الدوريات، الأندية، اللاعبون، الانتقالات
 *
 * يعمل لكل شيء رياضي ليس كأس العالم 2026
 * يُرجع دائماً { agent, source, confidence, ...data }
 */

import { runSportsAgent, classifySportsQuery } from '../lib/sports-agent.js'

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise(r => setTimeout(() => r(null), ms))])

export async function runGeneralSportsAgent(query, messages = []) {
  try {
    const classification = classifySportsQuery(query)
    const res = await withTimeout(runSportsAgent(query, messages), 20000)

    if (!res) {
      return {
        userResponse: buildNoDataResponse(query),
        found: false,
        agent: 'sports_agent',
        source: 'none',
        confidence: 'low',
        type: classification.type,
      }
    }

    const sources = res.sources || []
    return {
      ...res,
      agent: 'sports_agent',
      source: sources.length ? sources.join('/') : 'FotMob/SofaScore',
      confidence: res.found ? 'high' : 'low',
      type: res.type || classification.type,
    }
  } catch (err) {
    console.error('[SportsAgent] error:', err.message)
    return {
      userResponse: buildNoDataResponse(query),
      found: false,
      agent: 'sports_agent',
      source: 'error',
      confidence: 'none',
    }
  }
}

function buildNoDataResponse(query = '') {
  return [
    `## ⚽ الوكيل الرياضي`,
    ``,
    `> ⚠️ **لا توجد بيانات مؤكدة** لهذا الطلب من المصادر الرسمية حالياً.`,
    ``,
    `**للمتابعة المباشرة:**`,
    `- [FotMob](https://www.fotmob.com) | [SofaScore](https://www.sofascore.com) | [365score](https://www.365scores.com/ar)`,
  ].join('\n')
}
