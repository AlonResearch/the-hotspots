# AGENTS.md

Operating principles and engineering rules for AI coding assistants in this repository.

---

## 🎯 Core Operating Principles

### 1. No Premature or Unverified Solutions
- **Do not invent or assume technical architectures, algorithms, frameworks, or database schemas that have not been explicitly decided with the user.**
- Keep GroundTruth.md strictly aligned with what actually exists and what has been verified. Speculative features belong in discussion, not in the code or baseline documents.

### 2. Documentation Maintenance (The 4-Document Rule)
- GroundTruth.md: Must be updated whenever architecture, data flow, or components change. Immediately prune dead references.
- Changelog.md: Must record changes before committing.
- AGENTS.md: Live steering buffer. Capture rules when friction occurs. **The agent must never prune rules from this file.**
- README.md: Public-facing front door for users and incoming team contributors.
- Contributor.md: since 2026-11-15 the maintainer and contributor guide (data, build, run, method in plain words) is Contributor.md, and README.md is the project summary for readers and NASA judges. Keep both in step: a change of method or numbers goes into both, and every claim in README.md links to the document that holds its source.

### 3. Commit & Deployment Protocol
- **Direct Commits**: Make clean, granular commits directly to main (feat(...), fix(...), chore(...)).
- **Local Commits by Default**: Commit locally. Only push to GitHub when explicitly instructed by the user.
- **Meaningful Commit Messages**: Follow conventional commits with a concise description of what was changed and why.

### 4. Code Quality & Standards
- Write clean, idiomatic code with clear separation of concerns.
- Avoid theatrical language, filler comments, and AI clichés in documentation and PR descriptions.
- Ensure all created tools, scripts, and endpoints have clear error handling and reproducibility.

### 5. Local Developer Overrides
- If AGENTS.local.md is present in the workspace root, agents must read and honor its developer-specific preferences and style overrides.

### 6. Phones First-Class
- Every feature of the web app must work on a phone by touch. The personas must not need a computer.
- Scrolling a list, the panel or the time strip must never trigger the items under the finger: act on tap, not on touch start or drag.
- Check UI changes with `web/tests/e2e/mobile.spec.ts` (Chromium and WebKit) before calling them done.
