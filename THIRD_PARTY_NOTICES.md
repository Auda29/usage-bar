# Third-party notices

## OpenChamber

https://github.com/openchamber/openchamber

Reference commit: 8e2db38a63ac56575aa1519acc49f19ba4d8fddb

Additional Claude credential-discovery reference: installed OpenChamber 2.5.2 and commit ae9cb2584e5027d06671efcb06cf607360110d5d, specifically `quota/providers/claude/auth.js` and `opencode/auth.js`. Usage Bar implements local, read-only access to OpenCode 2's selected provider record for standalone use.

The compact layout follows `WorkStatusUsageSection.tsx` and `WorkStatusPrimitives.tsx`. Provider access and normalization follow the quota modules. The Claude, Codex, Gemini, Copilot, Cursor, and OpenRouter SVGs in `assets/` are copied from the provider-logo assets. Provider names and marks belong to their respective owners. This project is independent of OpenChamber and the supported providers.

```text
MIT License

Copyright (c) 2025 Bohdan Triapitsyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Electron and Chromium

https://www.electronjs.org/

The packaged application includes Electron's `LICENSE` and Chromium's `LICENSES.chromium.html` alongside the executable.

## Gemini CLI protocol reference

https://github.com/google-gemini/gemini-cli

Gemini quota request shapes are based on the official Gemini CLI's `code_assist/server.ts` and `types.ts`. Public OAuth client parameters are read at runtime from the user's local Gemini CLI installation or explicit configuration and are not bundled with Usage Bar. The upstream project is licensed under Apache-2.0; see https://github.com/google-gemini/gemini-cli/blob/main/LICENSE.
