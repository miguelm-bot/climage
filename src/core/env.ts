import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

import type { ProviderEnv } from './types.js'

export type EnvLoadResult = {
  env: ProviderEnv
  loadedFiles: string[]
}

export function loadEnv(cwd = process.cwd()): EnvLoadResult {
  const candidates = ['.env', '.env.local']
  const loadedFiles: string[] = []

  for (const name of candidates) {
    const p = path.join(cwd, name)
    if (!fs.existsSync(p)) continue
    dotenv.config({ path: p, override: false })
    loadedFiles.push(p)
  }

  return { env: process.env as ProviderEnv, loadedFiles }
}
