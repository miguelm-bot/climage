#!/usr/bin/env node
import process from 'node:process';

import { generateImage, listProviders } from './index.js';
import type { GenerateOptions, ProviderId } from './core/types.js';

function usage(code = 0) {
  const providers = listProviders()
    .map((p) => `${p.id}`)
    .join(', ');

  // eslint-disable-next-line no-console
  console.log(`climage

Usage:
  climage "prompt"

Options:
  --provider <auto|${providers}>   Provider (default: auto)
  --model <id>                    Model id (provider-specific)
  --n <1..10>                     Number of images (default: 1)
  --format <png|jpg|webp>         Output format (default: png)
  --out <path>                    Output file path (only when n=1)
  --outDir <dir>                  Output directory (default: .)
  --name <text>                   Base name (slugified); default: prompt
  --aspect-ratio <w:h>            Aspect ratio (xAI supports e.g. 4:3)
  --json                          Print machine-readable JSON
  --verbose                       Verbose logging
  -h, --help                      Show help

Env:
  GEMINI_API_KEY (or GOOGLE_API_KEY)
  XAI_API_KEY (or XAI_TOKEN, GROK_API_KEY)
  FAL_KEY (or FAL_API_KEY)

Examples:
  npx climage "make image of kitten"
  npx climage "A cat in a tree" --provider xai --n 4
`);
  process.exit(code);
}

function parseArgs(argv: string[]): { prompt: string; opts: GenerateOptions; json: boolean } {
  const args = [...argv];
  const opts: GenerateOptions = {};
  let json = false;

  const take = (name: string): string => {
    const v = args.shift();
    if (!v) throw new Error(`Missing value for ${name}`);
    return v;
  };

  while (args.length) {
    const a = args[0];
    if (!a) break;
    if (a === '-h' || a === '--help') usage(0);
    if (a === '--json') {
      json = true;
      args.shift();
      continue;
    }
    if (!a.startsWith('-')) break;

    args.shift();
    switch (a) {
      case '--provider':
        opts.provider = take(a) as ProviderId;
        break;
      case '--model':
        opts.model = take(a);
        break;
      case '--n':
        opts.n = Number(take(a));
        break;
      case '--format':
        opts.format = take(a) as any;
        break;
      case '--out':
        opts.out = take(a);
        break;
      case '--outDir':
        opts.outDir = take(a);
        break;
      case '--name':
        opts.name = take(a);
        break;
      case '--aspect-ratio':
        opts.aspectRatio = take(a);
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      default:
        throw new Error(`Unknown option: ${a}`);
    }
  }

  const prompt = args.join(' ').trim();
  if (!prompt) throw new Error('Missing prompt');

  return { prompt, opts, json };
}

async function main() {
  try {
    const { prompt, opts, json } = parseArgs(process.argv.slice(2));
    const images = await generateImage(prompt, opts);

    if (json) {
      process.stdout.write(JSON.stringify({ images }, null, 2) + '\n');
      return;
    }

    for (const img of images) {
      process.stdout.write(img.filePath + '\n');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`climage: ${msg}\n`);
    process.stderr.write(`Run: climage --help\n`);
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
