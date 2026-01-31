#!/usr/bin/env node
import process from 'node:process';

import { generateMedia, listProviders } from './index.js';
import { toJsonResult } from './core/output.js';
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
  --n <1..10>                     Number of outputs (default: 1)
  --type <image|video>            Output type (default: image)
  --video                         Shortcut for: --type video
  --format <png|jpg|webp|mp4|webm|gif>
                                 Output format (default: png for image, mp4 for video)
  --out <path>                    Output file path (only when n=1)
  --outDir <dir>                  Output directory (default: .)
  --name <text>                   Base name (slugified); default: prompt
  --aspect-ratio <w:h>            Aspect ratio (provider-specific)
  --json                          Print machine-readable JSON
  --verbose                       Verbose logging
  -h, --help                      Show help

Input Images:
  --input <path>                  Input image for editing or reference (repeatable)
  --start-frame <path>            First frame image (for video generation)
  --end-frame <path>              Last frame image (for video interpolation)
  --duration <seconds>            Video duration in seconds (provider-specific)

Env:
  GEMINI_API_KEY (or GOOGLE_API_KEY)
  XAI_API_KEY (or XAI_TOKEN, GROK_API_KEY)
  FAL_KEY (or FAL_API_KEY)
  OPENAI_API_KEY

Examples:
  npx climage "make image of kitten"
  npx climage "A cat in a tree" --provider xai --n 4
  npx climage "a cinematic shot of a corgi running" --provider fal --type video
  npx climage "make the cat orange" --provider xai --input photo.jpg
  npx climage "the cat walks away" --video --provider google --start-frame cat.png
  npx climage "morphing transition" --video --provider fal --start-frame a.png --end-frame b.png
`);
  process.exit(code);
}

function parseArgs(argv: string[]): { prompt: string; opts: GenerateOptions; json: boolean } {
  const args = [...argv];
  const opts: GenerateOptions = {};
  let json = false;
  const promptParts: string[] = [];
  const inputImages: string[] = [];

  // Options that take a value
  const optionsWithValue = new Set([
    '--provider',
    '--model',
    '--n',
    '--type',
    '--format',
    '--out',
    '--outDir',
    '--name',
    '--aspect-ratio',
    '--input',
    '--start-frame',
    '--end-frame',
    '--duration',
  ]);

  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (!a) {
      i++;
      continue;
    }

    // Help
    if (a === '-h' || a === '--help') usage(0);

    // Boolean flags
    if (a === '--json') {
      json = true;
      i++;
      continue;
    }
    if (a === '--video') {
      opts.kind = 'video';
      i++;
      continue;
    }
    if (a === '--verbose') {
      opts.verbose = true;
      i++;
      continue;
    }

    // Options with values
    if (optionsWithValue.has(a)) {
      const v = args[i + 1];
      if (!v || v.startsWith('-')) throw new Error(`Missing value for ${a}`);
      switch (a) {
        case '--provider':
          opts.provider = v as ProviderId;
          break;
        case '--model':
          opts.model = v;
          break;
        case '--n':
          opts.n = Number(v);
          break;
        case '--type':
          opts.kind = v as any;
          break;
        case '--format':
          opts.format = v as any;
          break;
        case '--out':
          opts.out = v;
          break;
        case '--outDir':
          opts.outDir = v;
          break;
        case '--name':
          opts.name = v;
          break;
        case '--aspect-ratio':
          opts.aspectRatio = v;
          break;
        case '--input':
          inputImages.push(v);
          break;
        case '--start-frame':
          opts.startFrame = v;
          break;
        case '--end-frame':
          opts.endFrame = v;
          break;
        case '--duration':
          opts.duration = Number(v);
          break;
      }
      i += 2;
      continue;
    }

    // Unknown option
    if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`);
    }

    // Non-option = prompt part
    promptParts.push(a);
    i++;
  }

  // Add collected input images to opts
  if (inputImages.length) {
    opts.inputImages = inputImages;
  }

  const prompt = promptParts.join(' ').trim();
  if (!prompt) throw new Error('Missing prompt');

  return { prompt, opts, json };
}

async function main() {
  try {
    const { prompt, opts, json } = parseArgs(process.argv.slice(2));
    const items = await generateMedia(prompt, opts);

    if (json) {
      process.stdout.write(JSON.stringify(toJsonResult(items), null, 2) + '\n');
      return;
    }

    for (const item of items) {
      process.stdout.write(item.filePath + '\n');
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
